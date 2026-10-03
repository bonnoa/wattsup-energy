import { addDays, eachDay, localParts } from "@/lib/time";
import { priceIntervals } from "./engine";
import type {
  Contract,
  MonthBreakdown,
  PriceableInterval,
  PricedResult,
  TempoColor,
} from "./types";

// Contrats datés et historique de prix (SPEC §7.1, T18b). Un contrat souscrit couvre
// [startDate, endDate] (fin incluse, vide = en cours) ; ses grilles datées s'appliquent
// chacune de validFrom jusqu'à la suivante. Fonctions pures.

export interface PricePeriod {
  /** Date d'effet AAAA-MM-JJ. */
  validFrom: string;
  contract: Contract;
}

export interface DatedContract {
  id: string;
  name: string;
  status: "subscribed" | "simulated";
  startDate: string | null;
  endDate: string | null;
  /** Au moins une grille. */
  periods: PricePeriod[];
}

const byDate = (a: PricePeriod, b: PricePeriod) => a.validFrom.localeCompare(b.validFrom);

/** Grille en vigueur à une date : la plus récente déjà effective, sinon la première. */
export function gridAt(c: DatedContract, date: string): Contract {
  const sorted = [...c.periods].sort(byDate);
  const effective = sorted.filter((p) => p.validFrom <= date).at(-1) ?? sorted[0];
  if (!effective) throw new Error(`contrat sans grille : ${c.name}`);
  return effective.contract;
}

/** Grille la plus récente (celle qu'on simule pour comparer les offres aujourd'hui). */
export const latestGrid = (c: DatedContract): Contract => gridAt(c, "9999-12-31");

const activeOn = (c: DatedContract, date: string) =>
  c.status === "subscribed" &&
  c.startDate !== null &&
  c.startDate <= date &&
  (c.endDate === null || date <= c.endDate);

/** Contrat souscrit en vigueur à une date (au plus un, les périodes ne se chevauchant pas). */
export function currentContract(contracts: readonly DatedContract[], date: string) {
  return contracts.find((c) => activeOn(c, date)) ?? null;
}

/** Incohérences des contrats souscrits : fin avant début, périodes qui se chevauchent. */
export function findOverlaps(contracts: readonly DatedContract[]): string[] {
  const subscribed = contracts
    .filter((c) => c.status === "subscribed" && c.startDate !== null)
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  const errors: string[] = [];
  for (const c of subscribed) {
    if (c.endDate !== null && c.endDate < (c.startDate ?? "")) {
      errors.push(`« ${c.name} » : la fin précède le début`);
    }
  }
  if (errors.length > 0) return errors;
  for (let i = 1; i < subscribed.length; i++) {
    const prev = subscribed[i - 1] as DatedContract;
    const next = subscribed[i] as DatedContract;
    if (prev.endDate === null || (next.startDate ?? "") <= prev.endDate) {
      errors.push(`« ${prev.name} » et « ${next.name} » se chevauchent le ${next.startDate}`);
    }
  }
  return errors;
}

export interface Segment {
  /** Jours locaux [from, to). */
  from: string;
  to: string;
  /** Contrat souscrit en vigueur ; null si aucun (jour estimé ou non valorisable). */
  contractId: string | null;
  contract: Contract | null;
}

/**
 * Frise de [from, to) : un segment par combinaison (contrat, grille). Les jours sans
 * contrat souscrit reçoivent la grille actuelle du contrat en vigueur le jour `today`
 * (par défaut la veille de `to`), ou aucune s'il n'y en a pas.
 */
export function buildTimeline(
  contracts: readonly DatedContract[],
  from: string,
  to: string,
  today = addDays(to, -1),
): Segment[] {
  const current = currentContract(contracts, today);
  const fallback = current ? latestGrid(current) : null;

  const cuts = new Set([from, to]);
  for (const c of contracts) {
    if (c.status !== "subscribed" || c.startDate === null) continue;
    cuts.add(c.startDate);
    if (c.endDate !== null) cuts.add(addDays(c.endDate, 1));
    for (const p of c.periods) cuts.add(p.validFrom);
  }
  const bounds = [...cuts].filter((d) => d >= from && d <= to).sort();

  const segments: Segment[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i] as string;
    const b = bounds[i + 1] as string;
    const c = currentContract(contracts, a);
    const contract = c ? gridAt(c, a) : fallback;
    const last = segments.at(-1);
    if (last && last.contractId === (c?.id ?? null) && last.contract === contract) {
      last.to = b; // même contrat et même grille : on prolonge
    } else {
      segments.push({ from: a, to: b, contractId: c?.id ?? null, contract });
    }
  }
  return segments;
}

export interface TimelineResult extends PricedResult {
  /** Jours valorisés sans contrat souscrit (grille du contrat actuel). */
  unknownContractDays: number;
  /** kWh non valorisés faute de toute grille. */
  unpricedKwh: number;
}

/**
 * Coût réel d'intervalles selon une frise : chaque intervalle est rattaché au segment
 * de son jour local, chaque segment est valorisé par le moteur (abonnement compris).
 * Les centimes sont arrondis par segment.
 */
export function priceTimeline(
  intervals: readonly PriceableInterval[],
  segments: readonly Segment[],
  ctx: { timezone: string; tempoColor?: (day: string) => TempoColor | undefined },
): TimelineResult {
  const dayOf = (i: PriceableInterval) =>
    i.granularity === "hour" ? localParts(i.start, ctx.timezone).date : i.date;
  const buckets = segments.map(() => [] as PriceableInterval[]);
  for (const interval of intervals) {
    const day = dayOf(interval);
    const index = segments.findIndex((s) => s.from <= day && day < s.to);
    if (index !== -1) buckets[index]?.push(interval);
  }

  const result: TimelineResult = {
    totalCents: 0,
    energyCents: 0,
    subscriptionCents: 0,
    kwh: 0,
    byMonth: {},
    bySlot: {},
    approximatedKwh: 0,
    assumedTempoDays: 0,
    unknownContractDays: 0,
    unpricedKwh: 0,
  };

  segments.forEach((segment, i) => {
    const list = buckets[i] ?? [];
    if (segment.contractId === null)
      result.unknownContractDays += eachDay(segment.from, segment.to).length;
    if (!segment.contract) {
      result.unpricedKwh += list.reduce((a, x) => a + x.kwh, 0);
      return;
    }
    const r = priceIntervals(list, segment.contract, {
      timezone: ctx.timezone,
      period: { from: segment.from, to: segment.to },
      tempoColor: ctx.tempoColor,
    });
    result.totalCents += r.totalCents;
    result.energyCents += r.energyCents;
    result.subscriptionCents += r.subscriptionCents;
    result.kwh += r.kwh;
    result.approximatedKwh += r.approximatedKwh;
    result.assumedTempoDays += r.assumedTempoDays;
    for (const [month, m] of Object.entries(r.byMonth)) {
      const acc: MonthBreakdown = result.byMonth[month] ?? {
        energyCents: 0,
        subscriptionCents: 0,
        kwh: 0,
      };
      acc.energyCents += m.energyCents;
      acc.subscriptionCents += m.subscriptionCents;
      acc.kwh += m.kwh;
      result.byMonth[month] = acc;
    }
    for (const [slot, s] of Object.entries(r.bySlot)) {
      const acc = result.bySlot[slot] ?? { kwh: 0, energyCents: 0 };
      acc.kwh += s.kwh;
      acc.energyCents += s.energyCents;
      result.bySlot[slot] = acc;
    }
  });
  return result;
}
