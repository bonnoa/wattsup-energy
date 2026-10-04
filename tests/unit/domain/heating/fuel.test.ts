import { describe, expect, it } from "vitest";
import {
  currentStock,
  lastPurchasePrice,
  seasonConsumption,
  toBaseQty,
  weightedAvgPrice,
  type FuelEvent,
} from "@/domain/heating/fuel";

const settings = { pelletBagKg: 15, pelletBagsPerPallet: 66 };

const ev = (
  at: string,
  type: FuelEvent["type"],
  qty: number,
  unit: FuelEvent["unit"] = "bag",
  priceEur: number | null = null,
  fuel: FuelEvent["fuel"] = "pellet",
): FuelEvent => ({ fuel, type, at: new Date(at), qty, unit, priceEur });

describe("toBaseQty", () => {
  it("granulés en kg (sac et palette selon les réglages), bois en stères", () => {
    expect(toBaseQty({ fuel: "pellet", qty: 2, unit: "bag" }, settings)).toBe(30);
    expect(toBaseQty({ fuel: "pellet", qty: 1, unit: "pallet" }, settings)).toBe(990);
    expect(toBaseQty({ fuel: "pellet", qty: 12.5, unit: "kg" }, settings)).toBe(12.5);
    expect(toBaseQty({ fuel: "wood", qty: 0.5, unit: "stere" }, settings)).toBe(0.5);
  });

  it("refuse une unité incohérente avec le combustible", () => {
    expect(() => toBaseQty({ fuel: "wood", qty: 1, unit: "bag" }, settings)).toThrow(/unité/);
    expect(() => toBaseQty({ fuel: "pellet", qty: 1, unit: "stere" }, settings)).toThrow(/unité/);
  });
});

describe("currentStock", () => {
  const events = [
    ev("2025-09-01T10:00:00Z", "purchase", 1, "pallet", 420),
    ev("2025-10-20T19:00:00Z", "consumption", 1),
    ev("2025-10-21T19:00:00Z", "consumption", 1),
    ev("2025-11-01T09:00:00Z", "stock_snapshot", 50),
    ev("2025-11-02T19:00:00Z", "consumption", 2),
    ev("2025-11-05T12:00:00Z", "purchase", 10, "bag", 70),
    ev("2025-11-05T12:00:00Z", "consumption", 1, "bag", null, "wood"),
  ];

  it("sans relevé : achats moins consommations depuis zéro", () => {
    expect(currentStock(events, "pellet", new Date("2025-10-31T00:00:00Z"), settings)).toBe(
      990 - 30,
    );
  });

  it("le dernier relevé fait foi, puis achats et consommations postérieurs", () => {
    expect(currentStock(events, "pellet", new Date("2025-12-01T00:00:00Z"), settings)).toBe(
      (50 - 2 + 10) * 15,
    );
  });

  it("ignore les événements futurs et l'autre combustible", () => {
    expect(currentStock(events, "pellet", new Date("2025-08-01T00:00:00Z"), settings)).toBe(0);
    expect(currentStock([], "wood", new Date(), settings)).toBe(0);
  });
});

describe("seasonConsumption", () => {
  const season = { from: new Date("2025-10-01T00:00:00Z"), to: new Date("2026-05-01T00:00:00Z") };

  it("consommations saisies en priorité", () => {
    const events = [
      ev("2025-10-20T19:00:00Z", "consumption", 1),
      ev("2025-12-20T19:00:00Z", "consumption", 3),
      ev("2026-06-01T19:00:00Z", "consumption", 9), // hors saison
      ev("2025-11-01T09:00:00Z", "stock_snapshot", 50),
    ];
    expect(seasonConsumption(events, "pellet", season, settings)).toEqual({
      qty: 60,
      method: "events",
    });
  });

  it("sinon écarts entre relevés, corrigés des achats", () => {
    const events = [
      ev("2025-10-01T09:00:00Z", "stock_snapshot", 60),
      ev("2025-12-15T09:00:00Z", "purchase", 30, "bag", 210),
      ev("2026-01-10T09:00:00Z", "stock_snapshot", 40),
      ev("2026-04-30T09:00:00Z", "stock_snapshot", 10),
    ];
    // (60 + 30 − 40) + (40 − 10) = 80 sacs
    expect(seasonConsumption(events, "pellet", season, settings)).toEqual({
      qty: 80 * 15,
      method: "snapshots",
    });
  });

  it("rien d'exploitable : aucune méthode", () => {
    expect(
      seasonConsumption(
        [ev("2025-11-01T09:00:00Z", "stock_snapshot", 50)],
        "pellet",
        season,
        settings,
      ),
    ).toEqual({ qty: 0, method: "none" });
  });
});

describe("prix", () => {
  const purchases = [
    ev("2024-09-01T10:00:00Z", "purchase", 1, "pallet", 396),
    ev("2025-09-01T10:00:00Z", "purchase", 10, "bag", 75),
    ev("2025-10-01T10:00:00Z", "purchase", 5, "bag", null), // prix inconnu : ignoré
    ev("2025-10-02T10:00:00Z", "consumption", 1),
  ];

  it("prix moyen pondéré par la quantité, en € par kg ou par stère", () => {
    expect(weightedAvgPrice(purchases, "pellet", settings)).toBeCloseTo(
      (396 + 75) / (990 + 150),
      9,
    );
    expect(weightedAvgPrice(purchases, "wood", settings)).toBeNull();
  });

  it("dernier prix d'achat connu, par unité de base", () => {
    expect(lastPurchasePrice(purchases, "pellet", settings)).toBeCloseTo(75 / 150, 9);
    expect(lastPurchasePrice([], "pellet", settings)).toBeNull();
  });
});
