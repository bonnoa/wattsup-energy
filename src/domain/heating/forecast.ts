import type { Fuel, FuelSettings } from "./fuel";

// Prévision de réapprovisionnement (SPEC §7.5, T27). Pur. Quantités en unité de base
// (kg de granulés, stères de bois).

export const SCENARIOS = { doux: 0.9, moyen: 1, rigoureux: 1.15 } as const;
export type Scenario = keyof typeof SCENARIOS;

export interface SeasonHistory {
  label: string;
  /** Consommation de la saison en unité de base. */
  consumed: number;
  /** DJU de la saison ; null sans météo. */
  dju: number | null;
  /**
   * Saison en cours : sa consommation par DJU est exploitable, pas son total (elle n'est
   * retenue qu'avec la correction météo).
   */
  partial?: boolean;
}

export interface ForecastInput {
  fuel: Fuel;
  /** Saisons terminées, de la plus récente à la plus ancienne (N-1 et N-2 sont retenues). */
  history: readonly SeasonHistory[];
  scenario: Scenario;
  /** Stock disponible pour la saison visée. */
  stock: number;
  /** Déjà consommé sur la saison visée (0 pour une saison à venir). */
  alreadyConsumed: number;
  /** Dernier prix d'achat connu par unité de base ; null si aucun. */
  lastPricePerUnit: number | null;
  settings: FuelSettings;
}

export type Forecast =
  | { status: "insufficient" }
  | {
      status: "ok";
      /** Consommation par DJU (null sans correction météo). */
      perDju: number | null;
      djuRef: number | null;
      /** Besoin de la saison entière, scénario appliqué. */
      need: number;
      /** Reste à consommer : besoin − déjà consommé. */
      remaining: number;
      /** Stock pris en compte pour cette échéance. */
      stock: number;
      /** À acheter avant arrondi : reste − stock. */
      toBuy: number;
      /**
       * Commande arrondie : sacs pour les granulés (avec le nombre de palettes entières qui
       * les couvrent, pour qui achète à la palette), demi-stères pour le bois.
       */
      order: { pallets: number | null; bags: number | null; steres: number | null };
      /** Coût de la commande (au sac près pour les granulés) au dernier prix connu ; null sans prix. */
      costEur: number | null;
      basis: { seasons: string[]; weatherCorrected: boolean };
    };

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

export function forecastRefill(input: ForecastInput): Forecast {
  // Les deux saisons les plus récentes ; correction météo si chacune a ses DJU, sinon
  // simple moyenne des saisons terminées.
  // Une saison en cours n'est représentative qu'après la moitié du froid d'un hiver moyen.
  const completeDju = input.history.filter((h) => !h.partial && h.dju !== null && h.dju > 0);
  const typicalDju =
    completeDju.length > 0 ? mean(completeDju.map((h) => h.dju ?? 0)) : Number.POSITIVE_INFINITY;
  const candidates = input.history.filter(
    (h) => h.consumed > 0 && (!h.partial || (h.dju ?? 0) >= typicalDju / 2),
  );
  const recent = candidates.slice(0, 2);
  const withDju = recent.length > 0 && recent.every((h) => h.dju !== null && h.dju > 0);
  const seasons = withDju ? recent : candidates.filter((h) => !h.partial).slice(0, 2);
  if (seasons.length === 0) return { status: "insufficient" };
  const perDju = withDju ? mean(seasons.map((h) => h.consumed / (h.dju ?? 1))) : null;
  const djuRef = withDju ? mean(seasons.map((h) => h.dju ?? 0)) : null;
  const base =
    perDju !== null && djuRef !== null ? perDju * djuRef : mean(seasons.map((h) => h.consumed));
  const need = base * SCENARIOS[input.scenario];
  const remaining = Math.max(0, need - input.alreadyConsumed);
  const toBuy = Math.max(0, remaining - input.stock);

  let order: { pallets: number | null; bags: number | null; steres: number | null };
  let orderedQty: number;
  if (input.fuel === "pellet") {
    const { pelletBagKg: kg, pelletBagsPerPallet: perPallet } = input.settings;
    // Tolérance : 228,0000001 sacs ne doit pas devenir un sac de plus (ni −0).
    const bags = Math.max(0, Math.ceil(toBuy / kg - 1e-9));
    order = { pallets: Math.ceil(bags / perPallet), bags, steres: null };
    orderedQty = bags * kg;
  } else {
    const steres = Math.max(0, Math.ceil(toBuy * 2 - 1e-9) / 2);
    order = { pallets: null, bags: null, steres };
    orderedQty = steres;
  }

  return {
    status: "ok",
    perDju,
    djuRef,
    need,
    remaining,
    stock: input.stock,
    toBuy,
    order,
    costEur: input.lastPricePerUnit === null ? null : orderedQty * input.lastPricePerUnit,
    basis: { seasons: seasons.map((h) => h.label), weatherCorrected: withDju },
  };
}
