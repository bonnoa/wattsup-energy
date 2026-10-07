import { describe, expect, it } from "vitest";
import {
  formatAgo,
  formatDay,
  formatDuration,
  formatEur,
  formatEurFromCents,
  formatKwh,
  formatPercent,
} from "@/lib/format";

describe("formatDay", () => {
  it("AAAA-MM-JJ → JJ/MM/AAAA", () => {
    expect(formatDay("2024-01-31")).toBe("31/01/2024");
  });
});

describe("formatDuration (fin incluse)", () => {
  it("années et mois", () => {
    expect(formatDuration("2024-01-01", "2024-12-31")).toBe("1 an");
    expect(formatDuration("2014-01-01", "2024-12-31")).toBe("11 ans");
    expect(formatDuration("2023-01-15", "2024-04-14")).toBe("1 an et 3 mois");
    expect(formatDuration("2024-02-01", "2024-09-30")).toBe("8 mois");
  });

  it("moins d'un mois : en jours", () => {
    expect(formatDuration("2024-02-01", "2024-02-01")).toBe("1 jour");
    expect(formatDuration("2024-02-01", "2024-02-15")).toBe("15 jours");
  });
});

// Normalise les espaces insécables de fr-FR pour des assertions lisibles.
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("format fr-FR", () => {
  it("formate les euros sans décimales par défaut", () => {
    expect(plain(formatEur(1142))).toBe("1 142 €");
  });

  it("formate les centimes avec deux décimales", () => {
    expect(plain(formatEurFromCents(96820))).toBe("968,20 €");
  });

  it("formate les kWh avec virgule décimale", () => {
    expect(plain(formatKwh(16.94, 1))).toBe("16,9 kWh");
  });

  it("formate un ratio en pourcentage", () => {
    expect(plain(formatPercent(0.68))).toBe("68 %");
  });
});

describe("formatAgo", () => {
  it("minutes, heures puis jours au-delà de 48 h", () => {
    expect(formatAgo(20_000)).toBe("à l'instant");
    expect(formatAgo(12 * 60_000)).toBe("il y a 12 min");
    expect(formatAgo(5 * 3_600_000)).toBe("il y a 5 h");
    expect(formatAgo(47 * 3_600_000)).toBe("il y a 47 h");
    expect(formatAgo(72 * 3_600_000)).toBe("il y a 3 j");
    expect(formatAgo(-5000)).toBe("à l'instant");
  });
});
