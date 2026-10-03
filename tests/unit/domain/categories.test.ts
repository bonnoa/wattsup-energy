import { describe, expect, it } from "vitest";
import { parseCategoryInput, slugify, unknownSlugs } from "@/domain/categories";

describe("slugify", () => {
  it("minuscules sans accents, tirets entre les mots", () => {
    expect(slugify("Eau chaude")).toBe("eau-chaude");
    expect(slugify("  Chauffage électrique (salon) ")).toBe("chauffage-electrique-salon");
    expect(slugify("Véhicule n°2 — garage")).toBe("vehicule-n-2-garage");
    expect(slugify("ÇA_MARCHE")).toBe("ca-marche");
  });

  it("vide si rien d'utilisable, 64 caractères au plus sans tiret final", () => {
    expect(slugify("!!!")).toBe("");
    const long = slugify("a".repeat(60) + " bcdefgh");
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long.endsWith("-")).toBe(false);
  });
});

describe("parseCategoryInput", () => {
  const valid = {
    name: "Eau chaude",
    slug: "eau-chaude",
    icon: "droplet",
    color: "grid",
    isHeating: false,
  };

  it("accepte une saisie valide (nom nettoyé)", () => {
    const r = parseCategoryInput({ ...valid, name: "  Eau chaude " });
    expect(r).toEqual({ success: true, data: valid });
  });

  it("refuse slug, icône et couleur hors liste, avec des messages en français", () => {
    const r = parseCategoryInput({ ...valid, slug: "Eau Chaude", icon: "rocket", color: "#fff" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.errors).toEqual([
        "slug attendu : minuscules, chiffres et tirets",
        "icône inconnue",
        "couleur inconnue",
      ]);
    }
  });

  it("refuse un nom vide", () => {
    const r = parseCategoryInput({ ...valid, name: "  " });
    expect(r.success).toBe(false);
  });
});

describe("unknownSlugs", () => {
  it("slugs signalés unknown_category par les derniers envois, sans doublon ni poste existant", () => {
    const warnings = [
      [{ code: "unknown_category", key: "piscine" }, { code: "no_energy_data" }],
      [
        { code: "unknown_category", key: "piscine" },
        { code: "unknown_category", key: "spa" },
      ],
      [{ code: "unknown_category", key: "eau-chaude" }],
      "n'importe quoi",
    ];
    expect(unknownSlugs(warnings, ["eau-chaude"])).toEqual(["piscine", "spa"]);
  });
});
