import type { HourlyInterval, IngestWarning, Metric } from "./types";

// Les seaux horaires sont des heures UTC pleines. Pour les fuseaux à décalage entier
// (Europe/Paris), elles coïncident avec les heures locales, et les changements d'heure
// n'ont plus de cas particulier : l'heure dupliquée en octobre correspond à deux heures
// UTC distinctes, l'heure sautée en mars n'existe simplement pas.

const HOUR_MS = 3_600_000;

/** Au-delà de ce trou, le delta est absorbé sans créer de données (SPEC §6.1). */
export const MAX_GAP_HOURS = 24;

/** Plafonds de plausibilité en kWh/h : au-delà, la valeur est gardée mais signalée. */
const PLAUSIBLE_KWH_PER_HOUR: Record<string, number> = {
  grid_import: 36, // abonnement 36 kVA, le maximum en particulier
  grid_export: 36,
  solar_production: 50,
  battery_charge: 20,
  battery_charge_grid: 20,
  battery_discharge: 20,
};
const DEFAULT_PLAUSIBLE_KWH_PER_HOUR = 36;

/** Plafond de plausibilité d'un compteur, en kWh par heure (postes : 36). */
export const plausibleKwhPerHour = (metric: string) =>
  PLAUSIBLE_KWH_PER_HOUR[metric] ?? DEFAULT_PLAUSIBLE_KWH_PER_HOUR;

export interface MeterReading {
  metric: Metric;
  ts: Date;
  /** Index cumulé (capteur HA total_increasing), en kWh. */
  value: number;
}

export interface NormalizeResult {
  intervals: HourlyInterval[];
  warnings: IngestWarning[];
}

const floorHour = (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS;

/**
 * Transforme deux index cumulés successifs en intervalles horaires.
 * Le delta est réparti au prorata du temps passé dans chaque heure.
 */
export function indexToIntervals(
  prev: MeterReading | undefined,
  current: MeterReading,
): NormalizeResult {
  const { metric } = current;

  if (!Number.isFinite(current.value) || current.value < 0) {
    return { intervals: [], warnings: [{ code: "invalid_value", metric }] };
  }
  if (!prev) {
    return { intervals: [], warnings: [{ code: "baseline", metric }] };
  }

  const from = prev.ts.getTime();
  const to = current.ts.getTime();
  if (to <= from) {
    return { intervals: [], warnings: [{ code: "out_of_order", metric }] };
  }
  if (to - from > MAX_GAP_HOURS * HOUR_MS) {
    return {
      intervals: [],
      warnings: [{ code: "gap_too_long", metric, hours: MAX_GAP_HOURS }],
    };
  }

  const warnings: IngestWarning[] = [];
  let delta = current.value - prev.value;
  if (delta < 0) {
    // Compteur remis à zéro (redémarrage HA, remplacement) : l'énergie depuis le reset.
    delta = current.value;
    warnings.push({ code: "reset", metric });
  }

  const intervals = spread(metric, from, to, delta);

  const kwhPerHour = (delta / (to - from)) * HOUR_MS;
  const cap = plausibleKwhPerHour(metric);
  if (kwhPerHour > cap) {
    warnings.push({ code: "implausible", metric, kwhPerHour: round(kwhPerHour, 3) });
  }

  return { intervals, warnings };
}

function spread(metric: Metric, from: number, to: number, delta: number): HourlyInterval[] {
  const span = to - from;
  const intervals: HourlyInterval[] = [];
  let allocated = 0;

  for (let hour = floorHour(from); hour < to; hour += HOUR_MS) {
    const overlap = Math.min(to, hour + HOUR_MS) - Math.max(from, hour);
    const isLast = hour + HOUR_MS >= to;
    // Le dernier seau reçoit le reliquat : la somme égale exactement le delta.
    const kwh = isLast ? delta - allocated : (delta * overlap) / span;
    allocated += kwh;
    intervals.push({ metric, start: new Date(hour), kwh });
  }

  return intervals;
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
