import { monthLabel, nextMonth } from "./overview";

// Cohérence des données de batterie : une décharge sans charge (ou l'inverse) sur un mois,
// souvent un historique importé incomplet, fausse le solaire autoconsommé, la consommation
// du foyer et les économies de la batterie. Pur.

export interface BatteryMonth {
  /** « AAAA-MM ». */
  month: string;
  charge: number;
  discharge: number;
}

export interface BatteryGap {
  missing: "charge" | "discharge";
  months: string[];
}

/** En dessous, une seule des deux mesures sur un mois n'est pas significative. */
const MIN_KWH = 1;

export function batteryGaps(months: readonly BatteryMonth[]): BatteryGap[] {
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const pick = (missing: BatteryGap["missing"]) =>
    sorted
      .filter((m) =>
        missing === "charge"
          ? m.charge <= 0 && m.discharge >= MIN_KWH
          : m.discharge <= 0 && m.charge >= MIN_KWH,
      )
      .map((m) => m.month);
  return (["charge", "discharge"] as const)
    .map((missing) => ({ missing, months: pick(missing) }))
    .filter((g) => g.months.length > 0);
}

/** « février à mai 2026 », « août 2026 », « février 2026, avril à mai 2026 et … ». */
export function monthRangeLabel(months: readonly string[]): string {
  const runs: string[][] = [];
  for (const m of [...months].sort()) {
    const run = runs.at(-1);
    if (run && nextMonth(run.at(-1) ?? "") === m) run.push(m);
    else runs.push([m]);
  }
  const labels = runs.map((run) => {
    const first = run[0] ?? "";
    const last = run.at(-1) ?? "";
    if (first === last) return monthLabel(first);
    const sameYear = first.slice(0, 4) === last.slice(0, 4);
    const start = sameYear ? (monthLabel(first).split(" ")[0] ?? "") : monthLabel(first);
    return `${start} à ${monthLabel(last)}`;
  });
  return labels.length < 2
    ? (labels[0] ?? "")
    : `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}`;
}
