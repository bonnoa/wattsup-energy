import { and, asc, countDistinct, eq, gte, like, lt, min, or, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { energyInterval, household, weatherDaily } from "@/db/schema";
import {
  coverageWindow,
  energyBalance,
  expectedSlots,
  parsePeriod,
  periodNav,
  solarYield,
  yearMonths,
  type EnergyBalance,
  type Period,
} from "@/domain/overview";
import { visibleModules } from "@/domain/profile";
import { buildTimeline, priceTimeline, type TimelineResult } from "@/domain/tariff/timeline";
import type { PriceableInterval } from "@/domain/tariff/types";
import { cellOf, radiationKwhM2, sunshineHours } from "@/domain/weather";
import { addDays, eachDay, localParts, zonedInstant } from "@/lib/time";
import { listCategories } from "../categories";
import type { HouseholdContext } from "../context";
import { listContracts } from "../contracts";
import { tempoColorsFor } from "../tempo/sync";

// Vue d'ensemble (T20) : budget réel (contrat et grille en vigueur chaque jour), coût
// mensuel, bilan et origine de la consommation, postes, production et ensoleillement.
// Tous les jours, mois et bornes sont ceux du fuseau du foyer.

export interface MonthCost {
  key: string;
  energyCents: number;
  subscriptionCents: number;
  /** kWh soutirés au réseau. */
  kwh: number;
}

export interface SolarPoint {
  /** Jour « AAAA-MM-JJ » (vue mois) ou mois « AAAA-MM » (vue année). */
  key: string;
  kwh: number;
  sunshineHours: number | null;
}

export type Overview =
  | { status: "no-data" }
  | {
      status: "ok";
      period: Period;
      nav: { prev: string | null; next: string | null };
      granularity: "hourly" | "daily";
      /** Part des heures (horaire) ou des jours (quotidien) reçus sur les jours terminés. */
      coverage: number | null;
      budget: {
        /** null : aucun contrat pour chiffrer l'électricité. */
        totalCents: number | null;
        energyCents: number;
        subscriptionCents: number;
        /** Même période un an plus tôt (mêmes jours), null sans données. */
        previousCents: number | null;
        unknownContractDays: number;
      };
      /** Coût et kWh soutirés par mois de l'année de la période. */
      months: MonthCost[];
      balance: EnergyBalance;
      categories: {
        id: string;
        name: string;
        icon: string | null;
        color: string | null;
        isHeating: boolean;
        kwh: number;
      }[];
      solar: {
        points: SolarPoint[];
        kwh: number;
        /** kWh produits par kWh/m² reçu, et la même période un an plus tôt. */
        yield: number | null;
        previousYield: number | null;
        /** Aucune commune : pas de météo à mettre en regard. */
        noLocation: boolean;
      } | null;
    };

const shiftYear = (day: string, years: number) =>
  `${Number(day.slice(0, 4)) + years}${day.slice(4)}`.replace(/-02-29$/, "-02-28");

async function gridIntervals(ctx: HouseholdContext, from: string, to: string) {
  const rows = await db
    .select({
      start: energyInterval.start,
      granularity: energyInterval.granularity,
      tariffSlot: energyInterval.tariffSlot,
      kwh: energyInterval.kwh,
    })
    .from(energyInterval)
    .where(
      and(
        eq(energyInterval.householdId, ctx.householdId),
        eq(energyInterval.metric, "grid_import"),
        gte(energyInterval.start, zonedInstant(from, 0, ctx.timezone)),
        lt(energyInterval.start, zonedInstant(to, 0, ctx.timezone)),
      ),
    )
    .orderBy(asc(energyInterval.start));
  return rows.map((r): PriceableInterval =>
    r.granularity === "hour"
      ? { granularity: "hour", start: r.start, kwh: r.kwh }
      : {
          granularity: "day",
          date: localParts(r.start, ctx.timezone).date,
          slot: r.tariffSlot === "all" ? null : r.tariffSlot,
          kwh: r.kwh,
        },
  );
}

async function totalsByMetric(ctx: HouseholdContext, from: string, to: string) {
  const rows = await db
    .select({ metric: energyInterval.metric, kwh: sum(energyInterval.kwh).mapWith(Number) })
    .from(energyInterval)
    .where(
      and(
        eq(energyInterval.householdId, ctx.householdId),
        gte(energyInterval.start, zonedInstant(from, 0, ctx.timezone)),
        lt(energyInterval.start, zonedInstant(to, 0, ctx.timezone)),
      ),
    )
    .groupBy(energyInterval.metric);
  return Object.fromEntries(rows.map((r) => [r.metric, r.kwh]));
}

/** Part des créneaux attendus effectivement reçus pour l'import réseau, null sans jour terminé. */
async function periodCoverage(ctx: HouseholdContext, period: Period, today: string) {
  const window = coverageWindow(period, today);
  if (!window) return null;
  const [row] = await db
    .select({ received: countDistinct(energyInterval.start) })
    .from(energyInterval)
    .where(
      and(
        eq(energyInterval.householdId, ctx.householdId),
        eq(energyInterval.metric, "grid_import"),
        gte(energyInterval.start, zonedInstant(window.from, 0, ctx.timezone)),
        lt(energyInterval.start, zonedInstant(window.to, 0, ctx.timezone)),
      ),
    );
  const expected = expectedSlots(window.from, window.to, ctx.granularity, ctx.timezone);
  return expected > 0 ? Math.min(1, (row?.received ?? 0) / expected) : null;
}

/** Production solaire et météo par jour (vue mois) ou par mois (vue année). */
async function solarSeries(
  ctx: HouseholdContext,
  from: string,
  to: string,
  byMonth: boolean,
  cell: { latE2: number; lonE2: number } | null,
) {
  const local = sql`(${energyInterval.start} at time zone ${ctx.timezone})`;
  const keyExpr = byMonth
    ? sql<string>`to_char(${local}, 'YYYY-MM')`
    : sql<string>`to_char(${local}, 'YYYY-MM-DD')`;
  const production = await db
    .select({ key: keyExpr, kwh: sum(energyInterval.kwh).mapWith(Number) })
    .from(energyInterval)
    .where(
      and(
        eq(energyInterval.householdId, ctx.householdId),
        eq(energyInterval.metric, "solar_production"),
        gte(energyInterval.start, zonedInstant(from, 0, ctx.timezone)),
        lt(energyInterval.start, zonedInstant(to, 0, ctx.timezone)),
      ),
    )
    // Regroupement par position : le fuseau est un paramètre, l'expression répétée ne
    // serait pas reconnue identique par Postgres.
    .groupBy(sql`1`);
  const weather = cell
    ? await db
        .select({
          date: weatherDaily.date,
          sunshineS: weatherDaily.sunshineS,
          radiation: weatherDaily.radiationMjM2,
        })
        .from(weatherDaily)
        .where(
          and(
            eq(weatherDaily.latE2, cell.latE2),
            eq(weatherDaily.lonE2, cell.lonE2),
            gte(weatherDaily.date, from),
            lt(weatherDaily.date, to),
          ),
        )
    : [];
  const sunshine = new Map<string, number>();
  let radiation = 0;
  let radiationDays = 0;
  for (const w of weather) {
    const key = byMonth ? w.date.slice(0, 7) : w.date;
    const h = sunshineHours(w.sunshineS);
    if (h !== null) sunshine.set(key, (sunshine.get(key) ?? 0) + h);
    const r = radiationKwhM2(w.radiation);
    if (r !== null) {
      radiation += r;
      radiationDays += 1;
    }
  }
  const kwhByKey = new Map(production.map((p) => [p.key, p.kwh]));
  return { kwhByKey, sunshine, radiation: radiationDays > 0 ? radiation : null };
}

export async function getOverview(
  ctx: HouseholdContext,
  rawPeriod: string | undefined,
  now = new Date(),
): Promise<Overview> {
  const tz = ctx.timezone;
  const today = localParts(now, tz).date;
  const [first] = await db
    .select({ start: min(energyInterval.start) })
    .from(energyInterval)
    .where(
      and(
        eq(energyInterval.householdId, ctx.householdId),
        or(eq(energyInterval.metric, "grid_import"), like(energyInterval.metric, "solar%")),
      ),
    );
  if (!first?.start) return { status: "no-data" };
  const firstDay = localParts(first.start, tz).date;

  const period = parsePeriod(rawPeriod, today);
  const year = period.key.slice(0, 4);
  const yearFrom = `${year}-01-01`;
  const yearTo = [`${Number(year) + 1}-01-01`, addDays(today, 1)].sort()[0] as string;
  const previous = { from: shiftYear(period.from, -1), to: shiftYear(period.to, -1) };

  const [contracts, intervals, previousIntervals, totals, categories, home, coverage] =
    await Promise.all([
      listContracts(ctx),
      gridIntervals(ctx, yearFrom, yearTo),
      gridIntervals(ctx, previous.from, previous.to),
      totalsByMetric(ctx, period.from, period.to),
      listCategories(ctx, now),
      db
        .select({ location: household.location })
        .from(household)
        .where(eq(household.id, ctx.householdId)),
      periodCoverage(ctx, period, today),
    ]);
  const colors = await tempoColorsFor(ctx.householdId, addDays(previous.from, -1), yearTo);
  const pricing = { timezone: tz, tempoColor: (d: string) => colors.get(d) };
  const price = (list: PriceableInterval[], from: string, to: string): TimelineResult =>
    priceTimeline(list, buildTimeline(contracts, from, to, today), pricing);

  // Coût de l'année (barres mensuelles) puis de la période. Sans contrat souscrit ni
  // contrat actuel, la frise n'a aucune grille : l'électricité n'est pas chiffrée.
  const priced = buildTimeline(contracts, yearFrom, yearTo, today).some((s) => s.contract);
  const yearCost = price(intervals, yearFrom, yearTo);
  const dayOf = (i: PriceableInterval) =>
    i.granularity === "hour" ? localParts(i.start, tz).date : i.date;
  const inPeriod = intervals.filter((i) => dayOf(i) >= period.from && dayOf(i) < period.to);
  const periodCost = period.kind === "year" ? yearCost : price(inPeriod, period.from, period.to);
  // kWh soutirés par mois, chiffrés ou non (sans contrat, le coût reste vide, pas l'énergie).
  const kwhByMonth = new Map<string, number>();
  for (const i of intervals) {
    const month = dayOf(i).slice(0, 7);
    kwhByMonth.set(month, (kwhByMonth.get(month) ?? 0) + i.kwh);
  }
  const previousCost =
    previousIntervals.length > 0 ? price(previousIntervals, previous.from, previous.to) : null;

  const modules = visibleModules(ctx.profile);
  const balance = energyBalance(totals, { batteryGridCharging: ctx.settings.batteryGridCharging });

  let solar: Extract<Overview, { status: "ok" }>["solar"] = null;
  if (modules.solar) {
    const location = home[0]?.location ?? null;
    const cell = location ? cellOf(location) : null;
    const byMonth = period.kind === "year";
    const [current, before] = await Promise.all([
      solarSeries(ctx, period.from, period.to, byMonth, cell),
      solarSeries(ctx, previous.from, previous.to, byMonth, cell),
    ]);
    const keys = period.kind === "year" ? yearMonths(year, today) : eachDay(period.from, period.to);
    const kwhOf = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    const previousKwh = kwhOf(before.kwhByKey);
    solar = {
      points: keys.map((key) => ({
        key,
        kwh: current.kwhByKey.get(key) ?? 0,
        sunshineHours: current.sunshine.get(key) ?? null,
      })),
      kwh: balance.solar,
      yield: solarYield(balance.solar, current.radiation),
      previousYield: previousKwh > 0 ? solarYield(previousKwh, before.radiation) : null,
      noLocation: cell === null,
    };
  }

  return {
    status: "ok",
    period,
    nav: periodNav(period, firstDay, today),
    granularity: ctx.granularity,
    coverage,
    budget: {
      totalCents: priced ? periodCost.totalCents : null,
      energyCents: periodCost.energyCents,
      subscriptionCents: periodCost.subscriptionCents,
      previousCents: priced && previousCost ? previousCost.totalCents : null,
      unknownContractDays: periodCost.unknownContractDays,
    },
    months: yearMonths(year, today).map((key) => ({
      key,
      energyCents: yearCost.byMonth[key]?.energyCents ?? 0,
      subscriptionCents: yearCost.byMonth[key]?.subscriptionCents ?? 0,
      kwh: kwhByMonth.get(key) ?? 0,
    })),
    balance,
    categories: categories
      .filter((c) => modules.heatingCategories || !c.isHeating)
      .map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        isHeating: c.isHeating,
        kwh: totals[`category:${c.slug}`] ?? 0,
      })),
    solar,
  };
}
