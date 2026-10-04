import { addDays, eachDay } from "@/lib/time";
import { dju } from "../weather";

// Saison de chauffe et degrés-jours unifiés (SPEC §7.4, T25). Pur.

export interface SeasonBounds {
  /** « MM-JJ » inclus. */
  from: string;
  /** « MM-JJ » inclus. */
  to: string;
}

export interface HeatingSeason {
  /** « 2025–2026 » (ou « 2026 » si la saison tient dans l'année civile). */
  label: string;
  startYear: number;
  /** Jours locaux [from, to). */
  from: string;
  to: string;
}

const crossesYear = (b: SeasonBounds) => b.to < b.from;

export function seasonStarting(startYear: number, b: SeasonBounds): HeatingSeason {
  const endYear = crossesYear(b) ? startYear + 1 : startYear;
  return {
    label: crossesYear(b) ? `${startYear}–${endYear}` : String(startYear),
    startYear,
    from: `${startYear}-${b.from}`,
    to: addDays(`${endYear}-${b.to}`, 1),
  };
}

/** Saison en cours à cette date ; hors saison, la dernière saison commencée. */
export function heatingSeason(date: string, b: SeasonBounds): HeatingSeason {
  const year = Number(date.slice(0, 4));
  const startYear = date.slice(5) >= b.from ? year : year - 1;
  return seasonStarting(startYear, b);
}

/** DJU (base 18 °C) de la saison ; `missingDays` = jours de la saison sans température. */
export function seasonDju(
  days: readonly { date: string; tMean: number | null }[],
  season: HeatingSeason,
): { dju: number; days: number; missingDays: number } {
  let total = 0;
  let count = 0;
  for (const d of days) {
    if (d.date < season.from || d.date >= season.to || d.tMean === null) continue;
    total += dju(d.tMean) ?? 0;
    count += 1;
  }
  return { dju: total, days: count, missingDays: eachDay(season.from, season.to).length - count };
}
