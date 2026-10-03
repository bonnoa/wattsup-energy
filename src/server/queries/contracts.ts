import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { energyInterval } from "@/db/schema";
import { compareContracts, type ComparedContract } from "@/domain/tariff/compare";
import {
  buildTimeline,
  currentContract,
  latestGrid,
  priceTimeline,
} from "@/domain/tariff/timeline";
import type { PriceableInterval } from "@/domain/tariff/types";
import { addDays, eachDay, localParts, zonedInstant } from "@/lib/time";
import type { HouseholdContext } from "../context";
import { listContracts } from "../contracts";
import { tempoColorsFor } from "../tempo/sync";

// Comparaison des contrats sur la consommation réelle (T18) : 12 derniers mois, ou depuis
// la première donnée si l'historique est plus court (coût alors annualisé).

export const MIN_DAYS = 7;

export type ContractComparison =
  | { status: "no-data" }
  | { status: "insufficient"; days: number }
  | {
      status: "ok";
      from: string;
      to: string;
      periodDays: number;
      kwh: number;
      /** Part des heures (horaire) ou des jours (quotidien) effectivement reçus, 0–1. */
      coverage: number;
      granularity: "hourly" | "daily";
      redDays: number;
      rows: ComparedContract[];
      /** Coût réellement payé sur la période (contrat et grille en vigueur chaque jour). */
      real: { totalCents: number; annualCents: number; unknownContractDays: number } | null;
    };

export async function getContractComparison(
  ctx: HouseholdContext,
  now = new Date(),
): Promise<ContractComparison> {
  const tz = ctx.timezone;
  const today = localParts(now, tz).date;
  const windowFrom = addDays(today, -365);
  const where = and(
    eq(energyInterval.householdId, ctx.householdId),
    eq(energyInterval.metric, "grid_import"),
    gte(energyInterval.start, zonedInstant(windowFrom, 0, tz)),
    lt(energyInterval.start, zonedInstant(today, 0, tz)),
  );
  const rows = await db
    .select({
      start: energyInterval.start,
      granularity: energyInterval.granularity,
      tariffSlot: energyInterval.tariffSlot,
      kwh: energyInterval.kwh,
    })
    .from(energyInterval)
    .where(where)
    .orderBy(asc(energyInterval.start));
  const first = rows[0];
  if (!first) return { status: "no-data" };

  const from = localParts(first.start, tz).date;
  const periodDays = eachDay(from, today).length;
  if (periodDays < MIN_DAYS) return { status: "insufficient", days: periodDays };

  const intervals: PriceableInterval[] = rows.map((r) =>
    r.granularity === "hour"
      ? { granularity: "hour", start: r.start, kwh: r.kwh }
      : {
          granularity: "day",
          date: localParts(r.start, tz).date,
          slot: r.tariffSlot === "all" ? null : r.tariffSlot,
          kwh: r.kwh,
        },
  );

  // La veille de la période est incluse : ses heures de 0 h à 6 h sont du jour Tempo précédent.
  const colors = await tempoColorsFor(ctx.householdId, addDays(from, -1), today);
  const tempoColor = (d: string) => colors.get(d);
  const contracts = await listContracts(ctx);
  const current = currentContract(contracts, today);
  // Chaque offre est simulée avec sa grille actuelle : ce qu'elle coûterait aujourd'hui.
  const compared = compareContracts(
    contracts.map((c) => ({
      id: c.id,
      name: c.name,
      isCurrent: c.id === current?.id,
      contract: latestGrid(c),
    })),
    intervals,
    { timezone: tz, period: { from, to: today }, tempoColor },
    periodDays,
  );

  // Coût réel : contrat souscrit et grille en vigueur à chaque date.
  const hasSubscribed = contracts.some((c) => c.status === "subscribed");
  const timeline = hasSubscribed
    ? priceTimeline(intervals, buildTimeline(contracts, from, today, today), {
        timezone: tz,
        tempoColor,
      })
    : null;
  const real = timeline
    ? {
        totalCents: timeline.totalCents,
        annualCents: Math.round((timeline.totalCents * 365) / periodDays),
        unknownContractDays: timeline.unknownContractDays,
      }
    : null;

  // Couverture : heures reçues (mode horaire) ou jours reçus (mode quotidien).
  const hours = intervals.filter((i) => i.granularity === "hour").length;
  const days = new Set(intervals.flatMap((i) => (i.granularity === "day" ? [i.date] : []))).size;
  const coverage = ctx.granularity === "hourly" ? hours / (periodDays * 24) : days / periodDays;
  const redDays = eachDay(from, today).filter((d) => colors.get(d) === "rouge").length;

  return {
    status: "ok",
    from,
    to: today,
    periodDays,
    kwh: intervals.reduce((a, i) => a + i.kwh, 0),
    coverage: Math.min(1, coverage),
    granularity: ctx.granularity,
    redDays,
    rows: compared,
    real,
  };
}
