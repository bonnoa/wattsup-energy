import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { tempoCalendar, tempoOverride } from "@/db/schema";
import type { TempoColor } from "@/domain/tariff/types";
import {
  parseTempoSeed,
  seasonsBetween,
  tempoSeasonOf,
  type TempoDay,
} from "@/domain/tempo-calendar";
import { addDays, localParts } from "@/lib/time";
import seedFile from "../../../data/tempo-seed.json";
import type { TempoSource } from "./community";

// Calendrier Tempo global (SPEC §7.8) : amorcé par data/tempo-seed.json, complété par la
// source communautaire. Une couleur du foyer (HA ou correction manuelle) prime toujours.

export const tempoSyncEnabled = () => process.env.TEMPO_SYNC !== "off";

const today = (now = new Date()) => localParts(now, "Europe/Paris").date;

async function upsertDays(days: readonly TempoDay[], source: "community" | "seed") {
  if (days.length === 0) return;
  await db
    .insert(tempoCalendar)
    .values(days.map((d) => ({ ...d, source })))
    .onConflictDoUpdate({
      target: tempoCalendar.date,
      set: { color: sql`excluded.color`, source: sql`excluded.source`, fetchedAt: sql`now()` },
      // Le seed n'écrase jamais une couleur déjà récupérée en ligne.
      ...(source === "seed" ? { setWhere: sql`${tempoCalendar.source} = 'seed'` } : {}),
    });
}

/** Charge le fichier d'amorçage (idempotent). */
export async function loadTempoSeed(): Promise<number> {
  const days = parseTempoSeed(seedFile);
  await upsertDays(days, "seed");
  return days.length;
}

/**
 * Récupère les saisons depuis la dernière date connue jusqu'au lendemain (dont la
 * couleur est publiée vers 11 h). Une saison en échec n'arrête pas les suivantes.
 */
export async function syncTempo(source: TempoSource, now = new Date()) {
  const [last] = await db
    .select({ date: tempoCalendar.date })
    .from(tempoCalendar)
    .where(eq(tempoCalendar.source, "community"))
    .orderBy(desc(tempoCalendar.date))
    .limit(1);
  const tomorrow = addDays(today(now), 1);
  // Sans donnée en ligne, on part du début de la saison en cours (le seed couvre l'avant).
  const from = last?.date ?? `${tempoSeasonOf(today(now)).slice(0, 4)}-09-01`;
  const seasons = seasonsBetween(from, tomorrow);
  const failed: string[] = [];
  let days = 0;
  for (const season of seasons) {
    try {
      const fetched = await source.season(season);
      await upsertDays(fetched, "community");
      days += fetched.length;
    } catch {
      failed.push(season);
    }
  }
  return { seasons, days, failed };
}

/** Couleurs Tempo d'un foyer sur [from, to] : surcharge du foyer, sinon calendrier global. */
export async function tempoColorsFor(
  householdId: string,
  from: string,
  to: string,
): Promise<Map<string, TempoColor>> {
  const colors = new Map<string, TempoColor>();
  const calendar = await db
    .select({ date: tempoCalendar.date, color: tempoCalendar.color })
    .from(tempoCalendar)
    .where(and(gte(tempoCalendar.date, from), lte(tempoCalendar.date, to)));
  for (const row of calendar) colors.set(row.date, row.color);
  const overrides = await db
    .select({ date: tempoOverride.date, color: tempoOverride.color })
    .from(tempoOverride)
    .where(
      and(
        eq(tempoOverride.householdId, householdId),
        gte(tempoOverride.date, from),
        lte(tempoOverride.date, to),
      ),
    );
  for (const row of overrides) colors.set(row.date, row.color);
  return colors;
}
