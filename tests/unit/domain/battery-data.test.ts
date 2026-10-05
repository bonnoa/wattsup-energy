import { describe, expect, it } from "vitest";
import { batteryGaps, monthRangeLabel } from "@/domain/battery-data";

describe("batteryGaps", () => {
  it("repère les mois avec décharge sans charge, et l'inverse", () => {
    expect(
      batteryGaps([
        { month: "2026-02", charge: 0, discharge: 58.2 },
        { month: "2026-03", charge: 0, discharge: 116.5 },
        { month: "2026-06", charge: 146.6, discharge: 140.7 },
        { month: "2026-07", charge: 162.3, discharge: 0 },
      ]),
    ).toEqual([
      { missing: "charge", months: ["2026-02", "2026-03"] },
      { missing: "discharge", months: ["2026-07"] },
    ]);
  });

  it("ignore les mois cohérents, vides ou presque (moins de 1 kWh)", () => {
    expect(
      batteryGaps([
        { month: "2026-09", charge: 150.4, discharge: 127.7 },
        { month: "2026-10", charge: 0, discharge: 0.6 },
        { month: "2026-11", charge: 0, discharge: 0 },
      ]),
    ).toEqual([]);
  });
});

describe("monthRangeLabel", () => {
  it("regroupe les mois consécutifs", () => {
    expect(monthRangeLabel(["2026-02", "2026-03", "2026-04", "2026-05"])).toBe(
      "février à mai 2026",
    );
    expect(monthRangeLabel(["2026-08"])).toBe("août 2026");
    expect(monthRangeLabel(["2025-12", "2026-01"])).toBe("décembre 2025 à janvier 2026");
    expect(monthRangeLabel(["2026-02", "2026-04", "2026-05", "2026-09"])).toBe(
      "février 2026, avril à mai 2026 et septembre 2026",
    );
  });
});
