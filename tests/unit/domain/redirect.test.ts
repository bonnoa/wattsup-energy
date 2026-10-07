import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/domain/redirect";

describe("safeNextPath", () => {
  it("garde un chemin de l'application, avec sa requête", () => {
    expect(safeNextPath("/chauffage")).toBe("/chauffage");
    expect(safeNextPath("/reglages?onglet=alertes")).toBe("/reglages?onglet=alertes");
  });

  it("revient à l'accueil sans valeur", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("refuse toute adresse qui sortirait du site", () => {
    for (const evil of [
      "https://exemple.com",
      "//exemple.com",
      "/\\exemple.com",
      "\\\\exemple.com",
      "/\t/exemple.com",
      "javascript:alert(1)",
      "chauffage",
    ]) {
      expect(safeNextPath(evil), evil).toBe("/");
    }
  });
});
