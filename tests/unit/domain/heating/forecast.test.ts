import { describe, expect, it } from "vitest";
import { forecastRefill, SCENARIOS } from "@/domain/heating/forecast";

const settings = { pelletBagKg: 15, pelletBagsPerPallet: 66 };
// Deux hivers : 240 sacs pour 2 000 DJU, puis 216 sacs pour 1 800 DJU (1,8 kg/DJU)
const history = [
  { label: "2025–2026", consumed: 216 * 15, dju: 1800 },
  { label: "2024–2025", consumed: 240 * 15, dju: 2000 },
];

describe("forecastRefill", () => {
  it("parcours PRD 2 : 12 sacs en réserve → 216 sacs (4 palettes) au dernier prix", () => {
    const r = forecastRefill({
      fuel: "pellet",
      history,
      scenario: "moyen",
      stock: 12 * 15,
      alreadyConsumed: 0,
      lastPricePerUnit: 6.5 / 15,
      settings,
    });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    // conso/DJU = 1,8 kg ; DJU de référence = 1 900 ; besoin = 3 420 kg = 228 sacs
    expect(r.perDju).toBeCloseTo(1.8, 9);
    expect(r.djuRef).toBe(1900);
    expect(r.need).toBeCloseTo(3420, 6);
    expect(r.stock).toBe(180);
    expect(r.toBuy).toBeCloseTo(3420 - 180, 6);
    // 228 − 12 = 216 sacs à acheter (couverts par 4 palettes de 66)
    expect(r.order).toEqual({ pallets: 4, bags: 216, steres: null });
    expect(r.costEur).toBeCloseTo(216 * 6.5, 6);
    expect(r.basis).toEqual({ seasons: ["2025–2026", "2024–2025"], weatherCorrected: true });
  });

  it("scénarios doux / rigoureux : 0,90 et 1,15", () => {
    expect(SCENARIOS).toEqual({ doux: 0.9, moyen: 1, rigoureux: 1.15 });
    const base = {
      fuel: "pellet" as const,
      history,
      stock: 0,
      alreadyConsumed: 0,
      lastPricePerUnit: null,
      settings,
    };
    const soft = forecastRefill({ ...base, scenario: "doux" });
    const hard = forecastRefill({ ...base, scenario: "rigoureux" });
    if (soft.status !== "ok" || hard.status !== "ok") throw new Error("ok attendu");
    expect(soft.need).toBeCloseTo(3420 * 0.9, 6);
    expect(hard.need).toBeCloseTo(3420 * 1.15, 6);
    expect(soft.costEur).toBeNull();
  });

  it("saison en cours : déjà consommé déduit ; stock suffisant → rien à acheter", () => {
    const r = forecastRefill({
      fuel: "pellet",
      history,
      scenario: "moyen",
      stock: 150 * 15,
      alreadyConsumed: 100 * 15,
      lastPricePerUnit: 0.4,
      settings,
    });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.remaining).toBeCloseTo(3420 - 1500, 6);
    expect(r.toBuy).toBe(0);
    expect(r.order).toEqual({ pallets: 0, bags: 0, steres: null });
    expect(r.costEur).toBe(0);
  });

  it("bois : arrondi au demi-stère supérieur ; une seule saison connue suffit", () => {
    const r = forecastRefill({
      fuel: "wood",
      history: [{ label: "2025–2026", consumed: 5.2, dju: 2000 }],
      scenario: "moyen",
      stock: 1,
      alreadyConsumed: 0,
      lastPricePerUnit: 85,
      settings,
    });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.order).toEqual({ pallets: null, bags: null, steres: 4.5 });
    expect(r.costEur).toBeCloseTo(4.5 * 85, 6);
  });

  it("sans météo : moyenne des saisons, sans correction ; sans saison : données insuffisantes", () => {
    const r = forecastRefill({
      fuel: "pellet",
      history: [
        { label: "2025–2026", consumed: 3000, dju: null },
        { label: "2024–2025", consumed: 3600, dju: 2000 },
      ],
      scenario: "rigoureux",
      stock: 0,
      alreadyConsumed: 0,
      lastPricePerUnit: null,
      settings,
    });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.need).toBeCloseTo(3300 * 1.15, 6);
    expect(r.basis.weatherCorrected).toBe(false);
    expect(
      forecastRefill({
        fuel: "pellet",
        history: [],
        scenario: "moyen",
        stock: 0,
        alreadyConsumed: 0,
        lastPricePerUnit: null,
        settings,
      }),
    ).toEqual({ status: "insufficient" });
  });

  it("saison en cours retenue pour sa consommation par DJU, jamais pour son total", () => {
    const partial = { label: "2026–2027", consumed: 2400, dju: 1000, partial: true };
    const corrected = forecastRefill({
      fuel: "pellet",
      history: [partial, ...history],
      scenario: "moyen",
      stock: 0,
      alreadyConsumed: 0,
      lastPricePerUnit: null,
      settings,
    });
    if (corrected.status !== "ok") throw new Error(corrected.status);
    expect(corrected.basis.seasons).toEqual(["2026–2027", "2025–2026"]);
    expect(corrected.perDju).toBeCloseTo((2400 / 1000 + 1.8) / 2, 9);

    // Début de saison (moins de la moitié du froid habituel) : pas représentatif.
    const early = forecastRefill({
      fuel: "pellet",
      history: [{ ...partial, consumed: 30, dju: 20 }, ...history],
      scenario: "moyen",
      stock: 0,
      alreadyConsumed: 0,
      lastPricePerUnit: null,
      settings,
    });
    if (early.status !== "ok") throw new Error(early.status);
    expect(early.basis.seasons).toEqual(["2025–2026", "2024–2025"]);

    const noWeather = forecastRefill({
      fuel: "pellet",
      history: [{ ...partial, dju: null }, ...history],
      scenario: "moyen",
      stock: 0,
      alreadyConsumed: 0,
      lastPricePerUnit: null,
      settings,
    });
    if (noWeather.status !== "ok") throw new Error(noWeather.status);
    // Saison en cours sans météo écartée ; les saisons terminées restent corrigées.
    expect(noWeather.basis).toEqual({
      seasons: ["2025–2026", "2024–2025"],
      weatherCorrected: true,
    });
  });
});
