import { describe, expect, it } from "vitest";
import { formatEur, formatEurFromCents, formatKwh, formatPercent } from "@/lib/format";

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
