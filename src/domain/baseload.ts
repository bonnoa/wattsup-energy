import { nextMonth } from "./overview";

// Talon de consommation (SPEC §9, Vue d'ensemble) : ce que la maison consomme en permanence,
// même quand personne n'utilise rien (box, réfrigérateur, VMC, veilles). Mesuré la nuit, de
// minuit à 6 h (heure locale) : l'heure la plus basse de chaque nuit, puis la médiane sur la
// période, qui écarte les nuits inhabituelles. Pur.

/** Consommation du foyer d'une heure de nuit : import + production + décharge − export − charge. */
export interface NightHour {
  /** Jour local de la nuit (le matin). */
  date: string;
  /** Heure locale, 0 à 5. */
  hour: number;
  kwh: number;
}

/** Heures d'une nuit à recevoir au moins (5 sur 6 : le passage à l'heure d'été en saute une). */
const MIN_HOURS = 5;
/** Nuits complètes nécessaires pour donner un talon. */
export const MIN_NIGHTS = 7;

/** Heure la plus basse de chaque nuit complète (kWh), par jour local. */
export function nightlyMinima(hours: readonly NightHour[]): Map<string, number> {
  // Heure doublée au passage à l'heure d'hiver : les deux relevés s'additionnent.
  const byNight = new Map<string, Map<number, number>>();
  for (const h of hours) {
    const n = byNight.get(h.date) ?? new Map<number, number>();
    n.set(h.hour, (n.get(h.hour) ?? 0) + h.kwh);
    byNight.set(h.date, n);
  }
  const minima = new Map<string, number>();
  for (const [date, n] of [...byNight].sort(([a], [b]) => a.localeCompare(b))) {
    const values = [...n.values()];
    if (values.length < MIN_HOURS || values.some((v) => v < 0)) continue;
    minima.set(date, Math.min(...values));
  }
  return minima;
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
};

/** kWh consommés en une heure → puissance moyenne en W (arrondie). */
export const watts = (kwhPerHour: number) => Math.round(kwhPerHour * 1000);

/** Puissance permanente (W) → kWh sur une année. */
export const yearlyKwh = (w: number) => (w * 8760) / 1000;

/** Talon des nuits [from, to) ; null s'il y a moins de MIN_NIGHTS nuits complètes. */
export function baseloadBetween(
  minima: ReadonlyMap<string, number>,
  from: string,
  to: string,
): { watts: number; nights: number } | null {
  const values = [...minima].filter(([d]) => d >= from && d < to).map(([, v]) => v);
  if (values.length < MIN_NIGHTS) return null;
  return { watts: watts(median(values)), nights: values.length };
}

/** Talon de chaque mois « AAAA-MM » (null sans assez de nuits). */
export function baseloadMonths(
  minima: ReadonlyMap<string, number>,
  months: readonly string[],
): { month: string; watts: number | null }[] {
  return months.map((month) => {
    const talon = baseloadBetween(minima, `${month}-01`, `${nextMonth(month)}-01`);
    return { month, watts: talon?.watts ?? null };
  });
}

/** Les `n` mois « AAAA-MM » qui se terminent par `last`, du plus ancien au plus récent. */
export function monthsEndingAt(last: string, n: number): string[] {
  const out: string[] = [];
  let [y, m] = last.split("-").map(Number) as [number, number];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}
