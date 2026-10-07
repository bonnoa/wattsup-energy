import { describe, expect, it } from "vitest";
import {
  NAME_MAX,
  parseInviteCodes,
  parseSignupMode,
  signupAllowed,
  validName,
} from "@/domain/signup";

describe("SIGNUP_MODE", () => {
  it("ouvert par défaut, fermé si la valeur est inconnue", () => {
    expect(parseSignupMode(undefined)).toBe("open");
    expect(parseSignupMode(" ")).toBe("open");
    expect(parseSignupMode("Invite")).toBe("invite");
    expect(parseSignupMode("closed")).toBe("closed");
    expect(parseSignupMode("oui")).toBe("closed");
  });

  it("invitation : code exigé parmi INVITE_CODES", () => {
    const codes = parseInviteCodes(" alpha, beta ,,");
    expect(codes).toEqual(["alpha", "beta"]);
    expect(signupAllowed("open", null, [])).toEqual({ ok: true });
    expect(signupAllowed("invite", "beta", codes)).toEqual({ ok: true });
    expect(signupAllowed("invite", "gamma", codes)).toEqual({
      ok: false,
      message: "Code d'invitation invalide.",
    });
    expect(signupAllowed("invite", null, [])).toMatchObject({ ok: false });
    expect(signupAllowed("closed", "alpha", codes)).toEqual({
      ok: false,
      message: "Les inscriptions sont fermées.",
    });
  });
});

describe("validName", () => {
  it("non vide une fois les espaces retirés, NAME_MAX caractères au plus", () => {
    expect(validName("Alexandre Bonno")).toBe(true);
    expect(validName("  ")).toBe(false);
    expect(validName("a".repeat(NAME_MAX))).toBe(true);
    expect(validName("a".repeat(NAME_MAX + 1))).toBe(false);
    expect(validName(42)).toBe(false);
  });
});
