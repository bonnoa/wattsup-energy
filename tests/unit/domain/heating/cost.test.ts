import { describe, expect, it } from "vitest";
import { fuelKwh, heatingCost } from "@/domain/heating/cost";

const factors = { pelletPerKg: 4.8, woodPerStere: 1800 };

describe("fuelKwh", () => {
  it("granulés : kg × 4,8 ; bois : stères × 1 800", () => {
    expect(fuelKwh("pellet", 15, factors)).toBeCloseTo(72, 9);
    expect(fuelKwh("wood", 0.5, factors)).toBe(900);
  });
});

describe("heatingCost", () => {
  it("électricité des postes chauffage (énergie seule) + combustibles au prix moyen pondéré", () => {
    const r = heatingCost({
      electric: { kwh: 300, energyCents: 7_500 },
      fuels: [
        { fuel: "pellet", qty: 3_600, avgPricePerUnit: 0.4 }, // 240 sacs à 6 €
        { fuel: "wood", qty: 3, avgPricePerUnit: 85 },
      ],
      factors,
    });
    expect(r).toEqual({
      totalCents: 7_500 + 144_000 + 25_500,
      byFuel: {
        electric: { cents: 7_500, kwh: 300 },
        pellet: { cents: 144_000, kwh: 17_280 },
        wood: { cents: 25_500, kwh: 5_400 },
      },
      kwh: 300 + 17_280 + 5_400,
      unpricedFuels: [],
    });
  });

  it("combustible sans achat chiffré : kWh comptés, coût signalé comme inconnu", () => {
    const r = heatingCost({
      electric: null,
      fuels: [{ fuel: "pellet", qty: 150, avgPricePerUnit: null }],
      factors,
    });
    expect(r.totalCents).toBe(0);
    expect(r.byFuel.pellet).toEqual({ cents: 0, kwh: 720 });
    expect(r.byFuel.electric).toBeUndefined();
    expect(r.unpricedFuels).toEqual(["pellet"]);
  });
});
