import { describe, expect, it } from "vitest";
import {
  parseCommunityDays,
  parseTempoSeed,
  seasonsBetween,
  tempoSeasonOf,
} from "@/domain/tempo-calendar";
import seed from "../../../data/tempo-seed.json";
import season from "../../fixtures/tempo/season-2026-2027.json";

describe("saisons Tempo", () => {
  it("une saison va du 1er septembre au 31 août", () => {
    expect(tempoSeasonOf("2025-09-01")).toBe("2025-2026");
    expect(tempoSeasonOf("2026-01-15")).toBe("2025-2026");
    expect(tempoSeasonOf("2026-08-31")).toBe("2025-2026");
    expect(tempoSeasonOf("2026-09-01")).toBe("2026-2027");
  });

  it("seasonsBetween couvre les bornes incluses", () => {
    expect(seasonsBetween("2026-08-30", "2026-10-04")).toEqual(["2025-2026", "2026-2027"]);
    expect(seasonsBetween("2026-10-01", "2026-10-04")).toEqual(["2026-2027"]);
  });
});

describe("parseCommunityDays", () => {
  it("lit une saison réelle et ignore les jours non publiés (code 0)", () => {
    const days = parseCommunityDays(season);
    expect(season).toHaveLength(35);
    expect(days).toHaveLength(34); // le dernier jour (code 0) n'est pas encore publié
    expect(days.every((d) => ["bleu", "blanc", "rouge"].includes(d.color))).toBe(true);
  });

  it("accepte un jour isolé et convertit les codes", () => {
    expect(parseCommunityDays({ dateJour: "2026-01-15", codeJour: 3 })).toEqual([
      { date: "2026-01-15", color: "rouge" },
    ]);
    expect(parseCommunityDays({ dateJour: "2026-10-05", codeJour: 0 })).toEqual([]);
  });

  it("rejette une réponse inattendue", () => {
    expect(() => parseCommunityDays({ message: "erreur" })).toThrow();
    expect(() => parseCommunityDays([{ dateJour: "2026-01-15", codeJour: 9 }])).toThrow();
  });
});

describe("fichier d'amorçage", () => {
  it("5 saisons complètes, 43 jours blancs et 22 rouges chacune", () => {
    const days = parseTempoSeed(seed);
    expect(days).toHaveLength(1826);
    for (const s of ["2021-2022", "2022-2023", "2023-2024", "2024-2025", "2025-2026"]) {
      const inSeason = days.filter((d) => tempoSeasonOf(d.date) === s);
      expect(inSeason.filter((d) => d.color === "blanc")).toHaveLength(43);
      expect(inSeason.filter((d) => d.color === "rouge")).toHaveLength(22);
    }
  });
});
