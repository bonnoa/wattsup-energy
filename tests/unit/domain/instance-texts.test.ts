import { describe, expect, it } from "vitest";
import {
  CONTACT_LABEL_MAX,
  CONTACT_NOTICE_MAX,
  DEFAULT_CONTACT_LABEL,
  parseContactTexts,
  parseRichText,
  resolveContactTexts,
} from "@/domain/instance-texts";

describe("parseContactTexts", () => {
  it("intitulé et texte nettoyés ; vides : valeurs par défaut (null)", () => {
    expect(parseContactTexts({ label: "  Écrire au créateur ", notice: " Texte \n" })).toEqual({
      ok: true,
      value: { label: "Écrire au créateur", notice: "Texte" },
    });
    expect(parseContactTexts({ label: " ", notice: "" })).toEqual({
      ok: true,
      value: { label: null, notice: null },
    });
  });

  it("refuse un intitulé ou un texte trop long, ou une valeur qui n'est pas du texte", () => {
    expect(parseContactTexts({ label: "x".repeat(CONTACT_LABEL_MAX + 1), notice: "" }).ok).toBe(
      false,
    );
    expect(parseContactTexts({ label: "", notice: "x".repeat(CONTACT_NOTICE_MAX + 1) }).ok).toBe(
      false,
    );
    expect(parseContactTexts({ label: 3, notice: "" }).ok).toBe(false);
  });
});

describe("resolveContactTexts", () => {
  it("« Contact » et aucun texte sans réglage", () => {
    expect(resolveContactTexts(null)).toEqual({ label: DEFAULT_CONTACT_LABEL, notice: null });
    expect(resolveContactTexts({ contactLabel: "Écrire au créateur", contactNotice: "A" })).toEqual(
      { label: "Écrire au créateur", notice: "A" },
    );
  });
});

describe("parseRichText", () => {
  it("paragraphes séparés par une ligne vide, gras entre doubles astérisques", () => {
    expect(parseRichText("**🔒 Vos données **\nici\n\nSecond")).toEqual([
      {
        type: "p",
        lines: [[{ text: "🔒 Vos données", bold: true }], [{ text: "ici", bold: false }]],
      },
      { type: "p", lines: [[{ text: "Second", bold: false }]] },
    ]);
  });

  it("listes à puces (* ou -), avec du gras dans un élément", () => {
    expect(parseRichText("Intro\n* **Un** : a\n- Deux")).toEqual([
      { type: "p", lines: [[{ text: "Intro", bold: false }]] },
      {
        type: "ul",
        items: [
          [
            { text: "Un", bold: true },
            { text: " : a", bold: false },
          ],
          [{ text: "Deux", bold: false }],
        ],
      },
    ]);
  });

  it("astérisques orphelins gardés tels quels ; texte vide : aucun bloc", () => {
    expect(parseRichText("2 * 3 **x")).toEqual([
      { type: "p", lines: [[{ text: "2 * 3 **x", bold: false }]] },
    ]);
    expect(parseRichText("  \n\n ")).toEqual([]);
  });
});
