import { describe, expect, it } from "vitest";
import { generateDemo, type DemoHour } from "../../../scripts/seed/generate";

const TZ = "Europe/Paris";
const year = generateDemo({ from: "2025-01-01", to: "2026-01-01", timezone: TZ, seed: 42 });
const sum = (hours: DemoHour[], key: keyof DemoHour) =>
  hours.reduce((a, h) => a + (h[key] as number), 0);
const month = (m: string) => year.hours.filter((h) => h.localDate.startsWith(`2025-${m}`));

describe("generateDemo", () => {
  it("est déterministe pour une même graine", () => {
    const opts = { from: "2025-03-01", to: "2025-03-08", timezone: TZ };
    const a = generateDemo({ ...opts, seed: 42 });
    const b = generateDemo({ ...opts, seed: 42 });
    const c = generateDemo({ ...opts, seed: 7 });
    expect(b.hours.map((h) => h.gridImport)).toEqual(a.hours.map((h) => h.gridImport));
    expect(c.hours.map((h) => h.gridImport)).not.toEqual(a.hours.map((h) => h.gridImport));
  });

  it("une heure par heure UTC de la période (8 760 h en 2025)", () => {
    expect(year.hours).toHaveLength(8760);
    expect(year.days).toHaveLength(365);
  });

  it("aucune valeur négative", () => {
    for (const h of year.hours) {
      for (const v of [
        h.gridImport,
        h.gridExport,
        h.solar,
        h.batteryCharge,
        h.batteryDischarge,
        h.waterHeater,
        h.electricHeating,
      ]) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("bilan énergétique respecté à chaque heure", () => {
    for (const h of year.hours) {
      const supply = h.gridImport + h.solar + h.batteryDischarge;
      const use = h.load + h.gridExport + h.batteryCharge;
      expect(Math.abs(supply - use)).toBeLessThan(1e-9);
    }
  });

  it("on n'importe pas et n'exporte pas en même temps, la batterie ne charge et ne décharge pas en même temps", () => {
    for (const h of year.hours) {
      expect(h.gridImport > 0 && h.gridExport > 0).toBe(false);
      expect(h.batteryCharge > 0 && h.batteryDischarge > 0).toBe(false);
    }
  });

  it("l'état de charge reste entre 0 et la capacité", () => {
    for (const h of year.hours) {
      expect(h.batterySoc).toBeGreaterThanOrEqual(-1e-9);
      expect(h.batterySoc).toBeLessThanOrEqual(year.config.batteryKwh + 1e-9);
    }
  });

  it("pas de production solaire la nuit, plus en juillet qu'en décembre", () => {
    expect(
      year.hours.filter((h) => h.localHour < 5 || h.localHour > 22).every((h) => h.solar === 0),
    ).toBe(true);
    expect(sum(month("07"), "solar")).toBeGreaterThan(3 * sum(month("12"), "solar"));
  });

  it("chauffage électrique en hiver seulement, et plus d'import réseau en janvier qu'en juillet", () => {
    expect(sum(month("07"), "electricHeating")).toBe(0);
    expect(sum(month("01"), "electricHeating")).toBeGreaterThan(0);
    expect(sum(month("01"), "gridImport")).toBeGreaterThan(sum(month("07"), "gridImport"));
  });

  it("ordres de grandeur réalistes sur un an", () => {
    const solar = sum(year.hours, "solar");
    const load = sum(year.hours, "load");
    expect(solar).toBeGreaterThan(2_500); // ~3 kWc à Nantes
    expect(solar).toBeLessThan(4_500);
    expect(load).toBeGreaterThan(3_500);
    expect(load).toBeLessThan(7_000);
  });

  it("météo quotidienne : plus froide et moins ensoleillée en hiver", () => {
    const jan = year.days.filter((d) => d.date.startsWith("2025-01"));
    const jul = year.days.filter((d) => d.date.startsWith("2025-07"));
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(jan.map((d) => d.tMean))).toBeLessThan(avg(jul.map((d) => d.tMean)) - 8);
    expect(avg(jan.map((d) => d.sunshineS))).toBeLessThan(avg(jul.map((d) => d.sunshineS)));
    for (const d of year.days) expect(d.tMin).toBeLessThanOrEqual(d.tMax);
  });
});
