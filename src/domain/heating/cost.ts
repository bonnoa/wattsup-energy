import type { Fuel } from "./fuel";

// Équivalences kWh et coût de chauffe (SPEC §7.4, T25). Pur.

export interface KwhFactors {
  /** kWh par kg de granulés (4,8 par défaut). */
  pelletPerKg: number;
  /** kWh par stère de bois (1 800 par défaut). */
  woodPerStere: number;
}

/** Énergie d'une quantité de combustible en unité de base (kg ou stère). */
export const fuelKwh = (fuel: Fuel, qty: number, f: KwhFactors) =>
  qty * (fuel === "pellet" ? f.pelletPerKg : f.woodPerStere);

export interface HeatingCostInput {
  /**
   * Postes marqués « chauffage », valorisés par le moteur tarifaire : seule l'énergie compte
   * (l'abonnement appartient au contrat, pas au chauffage). null sans chauffage électrique.
   */
  electric: { kwh: number; energyCents: number } | null;
  /** Consommation de la période en unité de base et prix moyen pondéré par unité. */
  fuels: { fuel: Fuel; qty: number; avgPricePerUnit: number | null }[];
  factors: KwhFactors;
}

export interface HeatingCost {
  totalCents: number;
  byFuel: Partial<Record<Fuel | "electric", { cents: number; kwh: number }>>;
  kwh: number;
  /** Combustibles consommés sans aucun achat chiffré : coût inconnu (compté 0). */
  unpricedFuels: Fuel[];
}

export function heatingCost(input: HeatingCostInput): HeatingCost {
  const byFuel: HeatingCost["byFuel"] = {};
  const unpricedFuels: Fuel[] = [];
  if (input.electric) {
    byFuel.electric = { cents: input.electric.energyCents, kwh: input.electric.kwh };
  }
  for (const f of input.fuels) {
    if (f.avgPricePerUnit === null && f.qty > 0) unpricedFuels.push(f.fuel);
    byFuel[f.fuel] = {
      cents: Math.round(f.qty * (f.avgPricePerUnit ?? 0) * 100),
      kwh: fuelKwh(f.fuel, f.qty, input.factors),
    };
  }
  const parts = Object.values(byFuel);
  return {
    totalCents: parts.reduce((a, p) => a + p.cents, 0),
    byFuel,
    kwh: parts.reduce((a, p) => a + p.kwh, 0),
    unpricedFuels,
  };
}
