import { describe, expect, it } from "vitest";
import { validateCustomRules } from "@/domain/tariff/custom";
import { priceIntervals } from "@/domain/tariff/engine";
import type { CustomContract, PriceableInterval, PricingContext } from "@/domain/tariff/types";

// Montants attendus calculés à la main, indépendamment du moteur.

const TZ = "Europe/Paris";
const HOUR = 3_600_000;
const ALL_DAY = [{ from: "00:00", to: "24:00" }];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [6, 7];

function hourly(fromIso: string, toIso: string, kwh = 1): PriceableInterval[] {
  const out: PriceableInterval[] = [];
  for (let t = Date.parse(fromIso); t < Date.parse(toIso); t += HOUR) {
    out.push({ granularity: "hour", start: new Date(t), kwh });
  }
  return out;
}

const ctx = (from: string, to: string): PricingContext => ({ timezone: TZ, period: { from, to } });

const zenWeekEnd: CustomContract = {
  kind: "custom",
  subscriptionEurYear: 232.8,
  rules: [
    { label: "Week-end", days: WEEKEND, ranges: ALL_DAY, price: 0.1876 },
    { label: "Semaine", days: WEEKDAYS, ranges: ALL_DAY, price: 0.2489 },
  ],
};

describe("contrat Custom : Zen Week-End", () => {
  it("année 2026 : 104 jours de week-end, 2 496 h à prix réduit", () => {
    // 2026 commence un jeudi : 52 semaines + 1 jeudi → 104 jours de week-end.
    // Les deux changements d'heure tombent un dimanche (23 h puis 25 h) : 104 × 24 h.
    const r = priceIntervals(
      hourly("2025-12-31T23:00:00Z", "2026-12-31T23:00:00Z"),
      zenWeekEnd,
      ctx("2026-01-01", "2027-01-01"),
    );
    expect(r.bySlot["Week-end"]?.kwh).toBe(2496);
    expect(r.bySlot.Semaine?.kwh).toBe(6264);
    // 2 496 × 0,1876 + 6 264 × 0,2489 = 468,2496 + 1 559,1096 = 2 027,3592 €
    expect(r.energyCents).toBe(202736);
    expect(r.subscriptionCents).toBe(23280);
  });

  it("le samedi commence à minuit local, pas à minuit UTC", () => {
    // Vendredi 2 oct. 2026 23:00 local (21:00Z) puis samedi 00:00 local (22:00Z)
    const r = priceIntervals(
      hourly("2026-10-02T21:00:00Z", "2026-10-02T23:00:00Z"),
      zenWeekEnd,
      ctx("2026-10-02", "2026-10-02"),
    );
    expect(r.bySlot.Semaine?.kwh).toBe(1);
    expect(r.bySlot["Week-end"]?.kwh).toBe(1);
  });
});

describe("priorité des règles", () => {
  const nightFirst: CustomContract = {
    kind: "custom",
    subscriptionEurYear: 0,
    rules: [
      {
        label: "Nuit",
        days: [1, 2, 3, 4, 5, 6, 7],
        ranges: [{ from: "22:00", to: "06:00" }],
        price: 0.15,
      },
      { label: "Week-end", days: WEEKEND, ranges: ALL_DAY, price: 0.18 },
      { label: "Semaine", days: WEEKDAYS, ranges: ALL_DAY, price: 0.25 },
    ],
  };

  it("la première règle qui correspond s'applique (nuit du week-end = Nuit)", () => {
    // Samedi 3 oct. 2026, journée locale complète : 8 h de nuit, 16 h de week-end
    const r = priceIntervals(
      hourly("2026-10-02T22:00:00Z", "2026-10-03T22:00:00Z"),
      nightFirst,
      ctx("2026-10-03", "2026-10-03"),
    );
    expect(r.bySlot.Nuit?.kwh).toBe(8);
    expect(r.bySlot["Week-end"]?.kwh).toBe(16);
    expect(r.bySlot.Semaine).toBeUndefined();
  });

  it("plages à la demi-heure : l'heure de bord est partagée", () => {
    const halfHour: CustomContract = {
      kind: "custom",
      subscriptionEurYear: 0,
      rules: [
        {
          label: "Creuse",
          days: [1, 2, 3, 4, 5, 6, 7],
          ranges: [{ from: "22:30", to: "06:30" }],
          price: 0.2,
        },
        { label: "Pleine", days: [1, 2, 3, 4, 5, 6, 7], ranges: ALL_DAY, price: 0.3 },
      ],
    };
    // 2 oct. 2026, 22:00–23:00 local
    const r = priceIntervals(
      hourly("2026-10-02T20:00:00Z", "2026-10-02T21:00:00Z"),
      halfHour,
      ctx("2026-10-02", "2026-10-02"),
    );
    expect(r.bySlot.Creuse?.kwh).toBeCloseTo(0.5, 10);
    expect(r.bySlot.Pleine?.kwh).toBeCloseTo(0.5, 10);
  });
});

describe("intervalles journaliers", () => {
  it("jour couvert par une seule règle : exact", () => {
    const r = priceIntervals(
      [{ granularity: "day", date: "2026-10-03", slot: null, kwh: 12 }],
      zenWeekEnd,
      ctx("2026-10-03", "2026-10-03"),
    );
    expect(r.bySlot).toEqual({
      "Week-end": { kwh: 12, energyCents: Math.round(12 * 0.1876 * 100) },
    });
    expect(r.approximatedKwh).toBe(0);
  });

  it("jour à plusieurs règles : réparti au prorata des minutes, signalé", () => {
    const r = priceIntervals(
      [{ granularity: "day", date: "2026-10-05", slot: "hp", kwh: 24 }],
      {
        kind: "custom",
        subscriptionEurYear: 0,
        rules: [
          {
            label: "Nuit",
            days: [1, 2, 3, 4, 5, 6, 7],
            ranges: [{ from: "22:00", to: "06:00" }],
            price: 0.15,
          },
          { label: "Jour", days: [1, 2, 3, 4, 5, 6, 7], ranges: ALL_DAY, price: 0.25 },
        ],
      },
      ctx("2026-10-05", "2026-10-05"),
    );
    expect(r.bySlot.Nuit?.kwh).toBeCloseTo(8, 10);
    expect(r.bySlot.Jour?.kwh).toBeCloseTo(16, 10);
    expect(r.approximatedKwh).toBe(24);
  });
});

describe("validateCustomRules", () => {
  it("accepte un jeu de règles couvrant toute la semaine", () => {
    expect(validateCustomRules(zenWeekEnd.rules)).toEqual([]);
  });

  it("signale le premier trou de couverture", () => {
    const errors = validateCustomRules([
      { label: "Semaine", days: WEEKDAYS, ranges: ALL_DAY, price: 0.25 },
      { label: "Samedi", days: [6], ranges: ALL_DAY, price: 0.2 },
    ]);
    expect(errors).toEqual(["aucune règle ne couvre dimanche à 00:00"]);
  });

  it("signale un trou en cours de journée", () => {
    const errors = validateCustomRules([
      {
        label: "Matin",
        days: [1, 2, 3, 4, 5, 6, 7],
        ranges: [{ from: "00:00", to: "12:00" }],
        price: 0.2,
      },
      {
        label: "Soir",
        days: [1, 2, 3, 4, 5, 6, 7],
        ranges: [{ from: "12:30", to: "24:00" }],
        price: 0.3,
      },
    ]);
    expect(errors).toEqual(["aucune règle ne couvre lundi à 12:00"]);
  });

  it("refuse les libellés en double, les jours invalides et l'absence de règle", () => {
    expect(validateCustomRules([])).toEqual(["au moins une règle est requise"]);
    expect(
      validateCustomRules([
        { label: "A", days: [1, 2, 3, 4, 5, 6, 7], ranges: ALL_DAY, price: 0.2 },
        { label: "A", days: [8], ranges: ALL_DAY, price: 0.3 },
      ]),
    ).toEqual(["libellé en double : A", "jour invalide dans « A » : 8"]);
  });

  it("refuse un prix négatif et une plage invalide", () => {
    expect(
      validateCustomRules([
        { label: "A", days: [1, 2, 3, 4, 5, 6, 7], ranges: ALL_DAY, price: -0.1 },
        { label: "B", days: [1], ranges: [{ from: "25:00", to: "26:00" }], price: 0.2 },
      ]),
    ).toEqual(["prix invalide dans « A »", "plage invalide dans « B » : heure invalide : 25:00"]);
  });

  it("le moteur refuse un contrat dont la couverture est incomplète", () => {
    expect(() =>
      priceIntervals(
        [],
        {
          kind: "custom",
          subscriptionEurYear: 0,
          rules: [{ label: "Semaine", days: WEEKDAYS, ranges: ALL_DAY, price: 0.25 }],
        },
        ctx("2026-10-05", "2026-10-05"),
      ),
    ).toThrow(/samedi à 00:00/);
  });
});
