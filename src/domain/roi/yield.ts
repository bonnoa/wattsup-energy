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
