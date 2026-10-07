import { describe, expect, it } from "vitest";
import { energyCsvLine, exportFilename, formatKwhCsv } from "@/domain/export";

describe("energyCsvLine", () => {
  it("heure en UTC, jour à la date locale avec son créneau", () => {
    expect(
      energyCsvLine(
        {
          start: new Date("2026-01-01T23:00:00Z"),
          granularity: "hour",
          metric: "grid_import",
          kwh: 0.412,
          tariffSlot: "all",
        },
        "Europe/Paris",
      ),
    ).toBe("2026-01-01T23:00:00Z,grid_import,0.412,");
    expect(
      energyCsvLine(
        {
          start: new Date("2025-12-31T23:00:00Z"),
          granularity: "day",
          metric: "grid_import",
          kwh: 6.82,
          tariffSlot: "hc",
        },
        "Europe/Paris",
      ),
    ).toBe("2026-01-01,grid_import,6.82,hc");
  });

  it("kWh sans exposant ni zéros inutiles", () => {
    expect(formatKwhCsv(0.0001)).toBe("0.0001");
    expect(formatKwhCsv(12)).toBe("12");
    expect(formatKwhCsv(0)).toBe("0");
    expect(formatKwhCsv(1.5)).toBe("1.5");
  });

  it("nom de fichier daté", () => {
    expect(exportFilename("energie", "2026-10-07")).toBe("wattsup-energie-2026-10-07.csv");
    expect(exportFilename("donnees", "2026-10-07")).toBe("wattsup-donnees-2026-10-07.json");
  });
});
