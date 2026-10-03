import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { household, weatherDaily } from "@/db/schema";
import { cellOf, type Cell, type WeatherDay } from "@/domain/weather";
import { addDays, localParts } from "@/lib/time";
import type { WeatherSource } from "./open-meteo";

// Synchronisation météo (SPEC §7.9) : une requête par maille, jamais par foyer.

const PARIS = "Europe/Paris";
/** Jours récents redemandés chaque matin : couvre les révisions et un éventuel trou. */
export const RECENT_DAYS = 7;
export const BACKFILL_YEARS = 3;

export const weatherSyncEnabled = () => process.env.WEATHER_SYNC !== "off";

const today = (now = new Date()) => localParts(now, PARIS).date;

/**
 * Enregistre des jours pour une maille. L'archive (réanalyse ERA5) remplace tout ; la
 * prévision ne remplace jamais une valeur d'archive.
 */
export async function upsertWeatherDays(
  cell: Cell,
  days: readonly WeatherDay[],
  source: "forecast" | "archive",
): Promise<void> {
  if (days.length === 0) return;
  await db
    .insert(weatherDaily)
    .values(days.map((d) => ({ ...cell, ...d, source })))
    .onConflictDoUpdate({
      target: [weatherDaily.latE2, weatherDaily.lonE2, weatherDaily.date],
      set: {
        tMin: sql`excluded.t_min`,
        tMax: sql`excluded.t_max`,
        tMean: sql`excluded.t_mean`,
        sunshineS: sql`excluded.sunshine_s`,
        radiationMjM2: sql`excluded.radiation_mj_m2`,
        source: sql`excluded.source`,
        fetchedAt: sql`now()`,
      },
      ...(source === "forecast" ? { setWhere: sql`${weatherDaily.source} = 'forecast'` } : {}),
    });
}

/** Mailles distinctes des foyers localisés. */
export async function knownCells(): Promise<Cell[]> {
  const rows = await db
    .select({ location: household.location })
    .from(household)
    .where(isNotNull(household.location));
  const unique = new Map<string, Cell>();
  for (const { location } of rows) {
    if (!location) continue;
    const cell = cellOf(location);
    unique.set(`${cell.latE2}:${cell.lonE2}`, cell);
  }
  return [...unique.values()];
}

/** Jours terminés seulement : la journée en cours n'est qu'une prévision. */
const completed = (days: WeatherDay[], now: Date) => days.filter((d) => d.date < today(now));

/** Jours récents (dont la veille) pour chaque maille ; une maille en échec n'arrête pas les autres. */

export async function syncRecentWeather(
  source: WeatherSource,
  now = new Date(),
): Promise<{ cells: number; failed: Cell[] }> {
  const cells = await knownCells();
  const failed: Cell[] = [];
  for (const cell of cells) {
    try {
      const days = completed(await source.forecast(cell, RECENT_DAYS), now);
      await upsertWeatherDays(cell, days, "forecast");
    } catch {
      failed.push(cell);
    }
  }
  return { cells: cells.length, failed };
}

/** Historique d'une maille : archive sur BACKFILL_YEARS ans jusqu'à la veille, puis jours récents. */
export async function backfillCell(source: WeatherSource, cell: Cell, now = new Date()) {
  const to = addDays(today(now), -1);
  const from = addDays(to, -365 * BACKFILL_YEARS);
  await upsertWeatherDays(cell, await source.archive(cell, from, to), "archive");
  await upsertWeatherDays(
    cell,
    completed(await source.forecast(cell, RECENT_DAYS), now),
    "forecast",
  );
}

/** État de la météo stockée pour une maille (Réglages). */
export async function weatherStatus(cell: Cell) {
  const where = and(eq(weatherDaily.latE2, cell.latE2), eq(weatherDaily.lonE2, cell.lonE2));
  const [last] = await db
    .select({ date: weatherDaily.date })
    .from(weatherDaily)
    .where(where)
    .orderBy(desc(weatherDaily.date))
    .limit(1);
  const [total] = await db.select({ days: count() }).from(weatherDaily).where(where);
  return { lastDate: last?.date ?? null, days: total?.days ?? 0 };
}
