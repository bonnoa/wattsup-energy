import { describe, expect, it } from "vitest";
import { payback } from "@/domain/roi/payback";
import {
  batterySavings,
  solarSavings,
  type EnergySlot,
  type SavingsOptions,
} from "@/domain/roi/savings";
import { monthlyYields, yieldDeviation } from "@/domain/roi/yield";
import type { BaseContract, HphcContract } from "@/domain/tariff/types";

const base: BaseContract = { kind: "base", subscriptionEurYear: 200, priceEurKwh: 0.25 };
const hphc: HphcContract = {
  kind: "hphc",
  subscriptionEurYear: 200,
  prices: { hp: 0.3, hc: 0.2 },
  hcRanges: [{ from: "22:00", to: "06:00" }],
};

// Midi (heure pleine) : 4 kWh produits, 1 exporté, 2 en batterie dont 0,5 du réseau ;
// 23 h (heure creuse) : 1,5 kWh restitués par la batterie.
const slots: EnergySlot[] = [
  {
    interval: { granularity: "hour", start: new Date("2026-06-15T10:00:00Z") },
    solar: 4,
    gridExport: 1,
    batteryCharge: 2,
    batteryChargeGrid: 0.5,
    batteryDischarge: 0,
  },
  {
    interval: { granularity: "hour", start: new Date("2026-06-15T21:00:00Z") },
    solar: 0,
    gridExport: 0,
    batteryCharge: 0,
    batteryChargeGrid: 0,
    batteryDischarge: 1.5,
  },
];
const opts = (exportEnabled: boolean, batteryGridCharging: boolean): SavingsOptions => ({
  contract: hphc,
  timezone: "Europe/Paris",
  exportEnabled,
  exportPriceEurKwh: exportEnabled ? 0.1 : 0,
  batteryGridCharging,
});

describe("solarSavings — 4 combinaisons revente × charge réseau", () => {
  it("sans revente, sans charge réseau : autoconsommation directe = 4 − 1 − 2 = 1 kWh en HP", () => {
    const r = solarSavings(slots, opts(false, false));
    expect(r.parts).toEqual({ avoided: 30, export: 0, gridCharge: 0, lostExport: 0 });
    expect(r.totalCents).toBe(30);
    expect(r.byMonth).toEqual({ "2026-06": 30 });
  });

  it("avec revente : + 1 kWh exporté à 0,10 €", () => {
    expect(solarSavings(slots, opts(true, false)).totalCents).toBe(30 + 10);
  });

  it("charge réseau : seule la charge solaire (1,5 kWh) est retirée de l'autoconsommation", () => {
    const r = solarSavings(slots, opts(false, true));
    expect(r.parts.avoided).toBe(45); // 1,5 kWh en HP
    expect(solarSavings(slots, opts(true, true)).totalCents).toBe(45 + 10);
  });
});

describe("batterySavings — 4 combinaisons revente × charge réseau", () => {
  it("sans revente, sans charge réseau : 1,5 kWh restitués en HC", () => {
    const r = batterySavings(slots, opts(false, false));
    expect(r.parts).toEqual({ avoided: 30, export: 0, gridCharge: 0, lostExport: 0 });
  });

  it("avec revente : revente perdue sur les 2 kWh de charge solaire", () => {
    const r = batterySavings(slots, opts(true, false));
    expect(r.parts.lostExport).toBe(-20);
    expect(r.totalCents).toBe(30 - 20);
  });

  it("charge réseau : 0,5 kWh achetés en HP retirés ; revente perdue sur 1,5 kWh", () => {
    expect(batterySavings(slots, opts(false, true)).totalCents).toBe(30 - 15);
    const both = batterySavings(slots, opts(true, true));
    expect(both.parts).toEqual({ avoided: 30, export: 0, gridCharge: -15, lostExport: -15 });
    expect(both.totalCents).toBe(0);
    expect(both.byMonth).toEqual({ "2026-06": 0 });
  });

  it("sans contrat : rien à valoriser ; envoi quotidien accepté", () => {
    expect(batterySavings(slots, { ...opts(false, false), contract: null }).totalCents).toBe(0);
    const daily: EnergySlot[] = [
      {
        interval: { granularity: "day", date: "2026-06-15" },
        solar: 10,
        gridExport: 2,
        batteryCharge: 3,
        batteryChargeGrid: 0,
        batteryDischarge: 2.5,
      },
    ];
    const o = { ...opts(false, false), contract: base };
    expect(solarSavings(daily, o).totalCents).toBe(125); // 5 kWh × 0,25
    expect(batterySavings(daily, o).totalCents).toBe(63); // 2,5 × 0,25 = 62,5 → 63
  });
});

describe("payback", () => {
  const months = { "2025-07": 4_000, "2025-08": 6_000, "2025-09": 5_000, "2025-10": 900 };

  it("moyenne des mois complets (mois en cours exclu), date d'amortissement projetée", () => {
    const r = payback({
      costEur: 1_000,
      byMonth: months,
      currentMonth: "2025-10",
      today: "2025-10-04",
    });
    expect(r.cumulativeCents).toBe(15_900);
    expect(r.monthlyCents).toBe(5_000);
    expect(r.ratio).toBeCloseTo(0.159, 9);
    expect(r.status).toBe("in-progress");
    // (100 000 − 15 900) / 5 000 = 16,82 mois ≈ 512 jours
    expect(r.paybackDate).toBe("2027-02-28");
  });

  it("déjà amorti ; aucune économie positive", () => {
    expect(
      payback({ costEur: 100, byMonth: months, currentMonth: "2025-10", today: "2025-10-04" }),
    ).toMatchObject({ status: "amortized", ratio: 1, paybackDate: null });
    expect(
      payback({
        costEur: 1_000,
        byMonth: { "2025-09": -50 },
        currentMonth: "2025-10",
        today: "2025-10-04",
      }),
    ).toMatchObject({ status: "no-savings", ratio: 0, paybackDate: null });
  });
});

describe("rendement solaire normalisé", () => {
  const day = (date: string, kwh: number, radiation: number | null) => ({
    date,
    kwh,
    radiationKwhM2: radiation,
  });

  it("rendement mensuel (jours sans irradiation ignorés) et écart à la médiane des 12 mois", () => {
    const days = [
      day("2025-12-10", 4.2, 2), // 2,1
      day("2026-01-10", 4, 2), // 2,0
      day("2026-02-10", 6, 2.5), // 2,4
      day("2026-03-10", 11, 5), // 2,2
      day("2026-04-10", 9, 5), // 1,8 : −16 % sous la médiane 2,15
      day("2026-04-11", 3, null),
    ];
    const yields = monthlyYields(days);
    expect(yields).toEqual({
      "2025-12": 2.1,
      "2026-01": 2,
      "2026-02": 2.4,
      "2026-03": 2.2,
      "2026-04": 1.8,
    });
    const d = yieldDeviation(yields, "2026-04");
    expect(d?.reference).toBeCloseTo(2.15, 9);
    expect(d?.deviation).toBeCloseTo(1.8 / 2.15 - 1, 9);
    expect(d?.alert).toBe(true);
    expect(yieldDeviation(yields, "2026-03")?.alert).toBe(false);
    expect(yieldDeviation(yields, "2026-02")).toBeNull(); // moins de 3 mois de référence
  });
});
