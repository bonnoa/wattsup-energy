import { describe, expect, it } from "vitest";
import {
  baseloadBetween,
  baseloadMonths,
  monthsEndingAt,
  nightlyMinima,
  watts,
  yearlyKwh,
  type NightHour,
} from "@/domain/baseload";

/** Une nuit complète (0 h–5 h) dont l'heure la plus basse vaut `low` kWh. */
const night = (date: string, low: number): NightHour[] =>
  [0, 1, 2, 3, 4, 5].map((hour) => ({ date, hour, kwh: hour === 3 ? low : low + 0.1 }));

describe("nightlyMinima", () => {
  it("heure la plus basse de chaque nuit complète", () => {
    const m = nightlyMinima([...night("2026-01-01", 0.2), ...night("2026-01-02", 0.15)]);
    expect([...m.entries()]).toEqual([
      ["2026-01-01", 0.2],
      ["2026-01-02", 0.15],
    ]);
  });

  it("nuit incomplète (moins de 5 heures) ou valeur négative : écartée", () => {
    const partial = night("2026-01-01", 0.2).slice(0, 4);
    const negative = night("2026-01-02", 0.2).map((h) => (h.hour === 1 ? { ...h, kwh: -0.3 } : h));
    expect(nightlyMinima([...partial, ...negative]).size).toBe(0);
  });

  it("changement d'heure : 5 heures suffisent, une heure doublée s'additionne", () => {
    const spring = night("2026-03-29", 0.2).filter((h) => h.hour !== 2);
    const autumn = [...night("2026-10-25", 0.2), { date: "2026-10-25", hour: 2, kwh: 0.3 }];
    const m = nightlyMinima([...spring, ...autumn]);
    expect(m.get("2026-03-29")).toBe(0.2);
    expect(m.get("2026-10-25")).toBe(0.2);
  });
});

describe("baseloadBetween", () => {
  const minima = new Map<string, number>();
  for (let d = 1; d <= 9; d++) minima.set(`2026-01-0${d}`, 0.1 + d * 0.01);
  minima.set("2026-01-10", 2); // nuit agitée : la médiane l'ignore

  it("médiane des minima de la période, en W", () => {
    expect(baseloadBetween(minima, "2026-01-01", "2026-02-01")).toEqual({
      watts: 155, // (0,15 + 0,16) / 2
      nights: 10,
    });
  });

  it("moins de 7 nuits : null", () => {
    expect(baseloadBetween(minima, "2026-01-01", "2026-01-07")).toBeNull();
  });
});

describe("baseloadMonths", () => {
  it("un talon par mois, null sans assez de nuits", () => {
    const minima = new Map<string, number>();
    for (let d = 10; d <= 20; d++) minima.set(`2026-02-${d}`, 0.18);
    expect(baseloadMonths(minima, ["2026-01", "2026-02"])).toEqual([
      { month: "2026-01", watts: null },
      { month: "2026-02", watts: 180 },
    ]);
  });
});

describe("conversions", () => {
  it("kWh sur une heure → W ; W permanents → kWh par an", () => {
    expect(watts(0.18)).toBe(180);
    expect(yearlyKwh(180)).toBeCloseTo(1576.8);
  });
});

describe("monthsEndingAt", () => {
  it("n mois jusqu'au mois donné, à cheval sur deux années", () => {
    expect(monthsEndingAt("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});
