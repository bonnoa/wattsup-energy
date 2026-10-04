import { describe, expect, it } from "vitest";
import { heatingSeason, seasonDju, seasonStarting } from "@/domain/heating/dju";

const bounds = { from: "10-01", to: "04-30" };

describe("heatingSeason", () => {
  it("saison en cours en hiver ; la dernière saison terminée en été", () => {
    expect(heatingSeason("2026-01-15", bounds)).toEqual({
      label: "2025–2026",
      startYear: 2025,
      from: "2025-10-01",
      to: "2026-05-01",
    });
    expect(heatingSeason("2026-10-03", bounds).label).toBe("2026–2027");
    expect(heatingSeason("2026-07-14", bounds).label).toBe("2025–2026");
    expect(heatingSeason("2026-04-30", bounds).label).toBe("2025–2026");
  });

  it("bornes paramétrables, saison dans une seule année civile", () => {
    expect(seasonStarting(2025, { from: "11-15", to: "03-31" })).toMatchObject({
      from: "2025-11-15",
      to: "2026-04-01",
    });
    expect(seasonStarting(2026, { from: "01-01", to: "03-31" })).toMatchObject({
      label: "2026",
      from: "2026-01-01",
      to: "2026-04-01",
    });
  });
});

describe("seasonDju", () => {
  const season = seasonStarting(2025, bounds);
  it("Σ max(0, 18 − t_mean) sur la saison ; jours sans température comptés à part", () => {
    const r = seasonDju(
      [
        { date: "2025-09-30", tMean: 5 }, // hors saison
        { date: "2025-10-01", tMean: 12 },
        { date: "2025-10-02", tMean: 20 }, // pas de chauffe
        { date: "2025-10-03", tMean: null },
        { date: "2026-04-30", tMean: 17.5 },
      ],
      season,
    );
    expect(r.dju).toBeCloseTo(6.5, 9);
    expect(r).toMatchObject({ days: 3, missingDays: 212 - 3 });
  });
});
