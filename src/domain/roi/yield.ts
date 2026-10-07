import { solarYield } from "../overview";

// Rendement solaire normalisé (SPEC §7.9, T29) : kWh produits par kWh/m² reçu. La
// référence est la médiane des rendements mensuels des 12 derniers mois complets ; un
// écart fortement négatif signale une baisse (panneaux sales, onduleur en défaut).

export interface DailySolar {
  date: string;
  kwh: number;
  /** Irradiation du jour en kWh/m², null si inconnue. */
  radiationKwhM2: number | null;
}

/** Rendement par mois « AAAA-MM » (jours avec irradiation connue seulement). */
export function monthlyYields(days: readonly DailySolar[]): Record<string, number> {
  const acc = new Map<string, { kwh: number; radiation: number }>();
  for (const d of days) {
    if (d.radiationKwhM2 === null) continue;
    const m = d.date.slice(0, 7);
    const a = acc.get(m) ?? { kwh: 0, radiation: 0 };
    a.kwh += d.kwh;
    a.radiation += d.radiationKwhM2;
    acc.set(m, a);
  }
  const out: Record<string, number> = {};
  for (const [m, a] of acc) {
    const y = solarYield(a.kwh, a.radiation);
    if (y !== null) out[m] = y;
  }
  return out;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

/** Seuil d'alerte : production 15 % sous le rendement attendu pour l'ensoleillement reçu. */
export const YIELD_ALERT = -0.15;

/**
 * Rendement d'un mois comparé à la référence (médiane des 12 mois complets précédents).
 * null sans référence (moins de 3 mois) ou sans rendement pour ce mois.
 */
export function yieldDeviation(
  yields: Record<string, number>,
  month: string,
): { yield: number; reference: number; deviation: number; alert: boolean } | null {
  const current = yields[month];
  const previous = Object.keys(yields)
    .filter((m) => m < month)
    .sort()
    .slice(-12)
    .map((m) => yields[m] ?? 0);
  if (current === undefined || previous.length < 3) return null;
  const reference = median(previous);
  if (reference <= 0) return null;
  const deviation = current / reference - 1;
  return { yield: current, reference, deviation, alert: deviation < YIELD_ALERT };
}

/** Irradiation minimale d'un jour pour juger son rendement (un jour très sombre est trop bruité). */
const MIN_DAY_RADIATION = 1;

/**
 * Écart au rendement habituel des `n` derniers jours complets (alerte T44). Référence : médiane
 * des rendements mensuels des 12 mois complets avant le mois en cours (3 au moins). Un jour
 * sans production reçue, sans irradiation ou trop sombre vaut null.
 */
export function recentYieldDeviations(
  days: readonly DailySolar[],
  today: string,
  previousDays: readonly string[],
): (number | null)[] | null {
  const month = today.slice(0, 7);
  const yields = monthlyYields(days.filter((d) => d.date < `${month}-01`));
  const months = Object.keys(yields).sort().slice(-12);
  if (months.length < 3) return null;
  const reference = median(months.map((m) => yields[m] ?? 0));
  if (reference <= 0) return null;
  const byDate = new Map(days.map((d) => [d.date, d]));
  return previousDays.map((date) => {
    const d = byDate.get(date);
    if (!d || d.radiationKwhM2 === null || d.radiationKwhM2 < MIN_DAY_RADIATION) return null;
    return d.kwh / d.radiationKwhM2 / reference - 1;
  });
}
