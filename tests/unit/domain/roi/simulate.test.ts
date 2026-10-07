import { describe, expect, it } from "vitest";
import { simulate, simulationSavings, type HourFlow } from "@/domain/roi/simulate";

const start = (h: number) => new Date(Date.UTC(2026, 5, 1, h));
const hour = (h: number, gridImport: number, gridExport: number, solar = 0): HourFlow => ({
  start: start(h),
  gridImport,
  gridExport,
  solar,
});
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("simulate — batterie", () => {
  // Midi : 4 kWh de surplus ; soir : 3 kWh achetés.
  const day = [hour(10, 0, 4, 5), hour(19, 3, 0)];

  it("stocke le surplus et le restitue le soir, rendement compris", () => {
    const r = simulate(day, { battery: { capacityKwh: 10, powerKw: 5, efficiency: 0.9 } });
    expect(r.hours[0]).toMatchObject({ gridImport: 0, gridExport: 0 });
    expect(r.hours[1]?.gridImport).toBeCloseTo(0);
    expect(r.totals.batteryIn).toBeCloseTo(4);
    expect(r.totals.batteryOut).toBeCloseTo(3);
  });

  it("capacité, puissance et rendement bornent l'échange", () => {
    const r = simulate(day, { battery: { capacityKwh: 2, powerKw: 1.5, efficiency: 0.8 } });
    // Charge limitée à 1,5 kWh (puissance) ; restitution 1,5 × 0,8 = 1,2 kWh.
    expect(r.hours[0]?.gridExport).toBeCloseTo(2.5);
    expect(r.hours[1]?.gridImport).toBeCloseTo(1.8);
    expect(r.totals.batteryOut).toBeCloseTo(1.2);
  });

  it("bilan conservé : achats évités = restitué, revente perdue = stocké", () => {
    const hours = Array.from({ length: 48 }, (_, h) =>
      hour(h, h % 24 >= 18 ? 1.2 : 0.2, h % 24 >= 10 && h % 24 < 15 ? 1.5 : 0),
    );
    const r = simulate(hours, { battery: { capacityKwh: 5, powerKw: 2.5, efficiency: 0.9 } });
    const importBefore = sum(hours.map((h) => h.gridImport));
    const exportBefore = sum(hours.map((h) => h.gridExport));
    expect(r.totals.importBefore - r.totals.importAfter).toBeCloseTo(r.totals.batteryOut);
    expect(r.totals.exportBefore - r.totals.exportAfter).toBeCloseTo(r.totals.batteryIn);
    expect(r.totals.importBefore).toBeCloseTo(importBefore);
    expect(r.totals.exportBefore).toBeCloseTo(exportBefore);
    expect(r.totals.batteryOut).toBeLessThanOrEqual(r.totals.batteryIn * 0.9 + 1e-9);
  });
});

describe("simulate — panneaux en plus", () => {
  it("production proportionnelle : d'abord consommée, le reste revendu", () => {
    // 3 kWc installés produisent 3 kWh à midi ; +3 kWc = 3 kWh de plus.
    const r = simulate([hour(12, 2, 0, 3)], { addKwc: 3, currentKwc: 3 });
    expect(r.hours[0]).toMatchObject({ gridImport: 0, gridExport: 1 });
    expect(r.totals.extraSolar).toBeCloseTo(3);
  });

  it("panneaux puis batterie : le surplus nouveau se stocke aussi", () => {
    const r = simulate([hour(12, 0, 0, 2), hour(20, 1, 0)], {
      addKwc: 2,
      currentKwc: 2,
      battery: { capacityKwh: 5, powerKw: 3, efficiency: 1 },
    });
    expect(r.hours[1]?.gridImport).toBeCloseTo(0);
    expect(r.totals.batteryIn).toBeCloseTo(2);
  });
});

describe("autoconsommation", () => {
  it("part de la production consommée sur place, avant et après", () => {
    const r = simulate([hour(12, 0, 2, 4), hour(20, 2, 0)], {
      battery: { capacityKwh: 5, powerKw: 5, efficiency: 1 },
    });
    expect(r.totals.selfConsumptionBefore).toBeCloseTo(0.5);
    expect(r.totals.selfConsumptionAfter).toBeCloseTo(1);
  });
});

describe("simulationSavings", () => {
  const contract = { kind: "base" as const, subscriptionEurYear: 200, priceEurKwh: 0.2 };
  const before = [hour(10, 0, 4, 5), hour(19, 3, 0)];
  const r = simulate(before, { battery: { capacityKwh: 10, powerKw: 5, efficiency: 0.75 } });

  it("achats évités au prix du contrat, revente perdue déduite", () => {
    // 3 kWh évités × 0,20 € − 4 kWh non revendus × 0,10 € = 0,20 €.
    const o = { contract, timezone: "Europe/Paris", exportPriceEurKwh: 0.1 };
    expect(simulationSavings(before, r.hours, o)).toBe(20);
    expect(simulationSavings(before, r.hours, { ...o, exportPriceEurKwh: null })).toBe(60);
  });
});
