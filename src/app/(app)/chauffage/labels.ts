import type { Fuel, FuelEventType, FuelUnit } from "@/domain/heating/fuel";

// Libellés des combustibles, partagés par les composants serveur et client.

export const FUEL_LABELS: Record<Fuel, string> = { pellet: "Granulés", wood: "Bois" };

export const EVENT_LABELS: Record<FuelEventType, string> = {
  consumption: "Consommation",
  purchase: "Achat",
  stock_snapshot: "Relevé de stock",
};

/** Nom d'une unité au pluriel (sélecteurs, libellés de champ). */
export const UNIT_NAMES: Record<FuelUnit, string> = {
  bag: "sacs",
  pallet: "palettes",
  kg: "kg",
  stere: "stères",
};

const plural = (n: number, one: string, many: string) => (Math.abs(n) >= 2 ? many : one);
const num = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/** « 1 sac », « 66 sacs », « 12,5 kg », « 0,5 stère », « 2 stères ». */
export function formatFuelQty(qty: number, unit: FuelUnit): string {
  switch (unit) {
    case "bag":
      return `${num(qty)} ${plural(qty, "sac", "sacs")}`;
    case "pallet":
      return `${num(qty)} ${plural(qty, "palette", "palettes")}`;
    case "kg":
      return `${num(qty)} kg`;
    case "stere":
      return `${num(qty)} ${plural(qty, "stère", "stères")}`;
  }
}
