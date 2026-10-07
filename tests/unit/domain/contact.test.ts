import { describe, expect, it } from "vitest";
import { CONTACT_MESSAGE_MAX, parseContactInput } from "@/domain/contact";

describe("parseContactInput", () => {
  it("motif connu et message nettoyé", () => {
    expect(parseContactInput({ kind: "bug", message: "  Le graphique est vide.\n" })).toEqual({
      ok: true,
      value: { kind: "bug", message: "Le graphique est vide." },
    });
  });

  it("motif inconnu, message vide ou trop long refusés", () => {
    expect(parseContactInput({ kind: "spam", message: " " })).toEqual({
      ok: false,
      errors: ["Choisissez un motif.", "Écrivez votre message."],
    });
    expect(
      parseContactInput({ kind: "contact", message: "a".repeat(CONTACT_MESSAGE_MAX + 1) }),
    ).toEqual({ ok: false, errors: [`Message : ${CONTACT_MESSAGE_MAX} caractères au plus.`] });
  });
});
