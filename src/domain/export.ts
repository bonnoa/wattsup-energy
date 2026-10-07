import { localParts } from "@/lib/time";

// Export de mes données (SPEC §9, Mon compte, T46). L'énergie part en CSV au format de
// l'import (docs/csv-format.md), donc réimportable : heures en UTC (`Z`), jours à la date
// locale du foyer avec leur créneau HP/HC. Pur.

export const ENERGY_CSV_HEADER = "timestamp,metric,kwh,tariff_slot";

export interface EnergyRow {
  start: Date;
  granularity: "hour" | "day";
  metric: string;
  kwh: number;
  tariffSlot: "all" | "hp" | "hc";
}

/** kWh en notation décimale (jamais d'exposant), 4 décimales au plus, sans zéros inutiles. */
export const formatKwhCsv = (kwh: number) => kwh.toFixed(4).replace(/\.?0+$/, "") || "0";

export function energyCsvLine(row: EnergyRow, timezone: string): string {
  const timestamp =
    row.granularity === "hour"
      ? row.start.toISOString().replace(/\.000Z$/, "Z")
      : localParts(row.start, timezone).date;
  const slot = row.tariffSlot === "all" ? "" : row.tariffSlot;
  return `${timestamp},${row.metric},${formatKwhCsv(row.kwh)},${slot}`;
}

/** Nom du fichier téléchargé, daté du jour : « wattsup-energie-2026-10-07.csv ». */
export const exportFilename = (kind: "energie" | "donnees", today: string) =>
  `wattsup-${kind}-${today}.${kind === "energie" ? "csv" : "json"}`;
