import { describe, expect, it } from "vitest";
import {
  CONTACT_INTRO_MAX,
  CONTACT_LABEL_MAX,
  CONTACT_NOTICE_MAX,
  DEFAULT_CONTACT_INTRO,
  DEFAULT_CONTACT_LABEL,
  DEFAULT_FORM_TITLE,
  parseContactTexts,
  parseRichText,
  resolveContactTexts,
} from "@/domain/instance-texts";

describe("parseContactTexts", () => {
  it("intitulé et texte nettoyés ; vides : valeurs par défaut (null)", () => {
    expect(
      parseContactTexts({
        label: "  Écrire au créateur ",
        intro: " Écrivez à Alex. ",
        notice: " Texte \n",
      }),
    ).toEqual({
      ok: true,
      value: { label: "Écrire au créateur", intro: "Écrivez à Alex.", notice: "Texte" },
    });
    expect(parseContactTexts({ label: " ", intro: "", notice: "" })).toEqual({
      ok: true,
      value: { label: null, intro: null, notice: null },
    });
  });

  it("refuse un intitulé ou un texte trop long, ou une valeur qui n'est pas du texte", () => {
    const ok = { label: "", intro: "", notice: "" };
    expect(parseContactTexts({ ...ok, label: "x".repeat(CONTACT_LABEL_MAX + 1) }).ok).toBe(false);
    expect(parseContactTexts({ ...ok, intro: "x".repeat(CONTACT_INTRO_MAX + 1) }).ok).toBe(false);
    expect(parseContactTexts({ ...ok, notice: "x".repeat(CONTACT_NOTICE_MAX + 1) }).ok).toBe(false);
    expect(parseContactTexts({ ...ok, label: 3 }).ok).toBe(false);
  });
});

describe("resolveContactTexts", () => {
  it("sans réglage : « Contact », phrase et titre du formulaire neutres, aucun texte", () => {
    expect(resolveContactTexts(null)).toEqual({
      label: DEFAULT_CONTACT_LABEL,
      intro: DEFAULT_CONTACT_INTRO,
      formTitle: DEFAULT_FORM_TITLE,
      notice: null,
    });
  });

  it("l'intitulé réglé sert aussi de titre au formulaire", () => {
    expect(
      resolveContactTexts({
        contactLabel: "Écrire au créateur",
        contactIntro: "Écrivez à Alex.",
        contactNotice: "A",
      }),
    ).toEqual({
      label: "Écrire au créateur",
      intro: "Écrivez à Alex.",
      formTitle: "Écrire au créateur",
      notice: "A",
    });
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
