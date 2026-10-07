import { describe, expect, it } from "vitest";
import {
  NAME_MAX,
  parseInviteCodes,
  parseSignupMode,
  parseSignupSettings,
  resolveSignupPolicy,
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

describe("resolveSignupPolicy", () => {
  it("le réglage de l'administrateur prime sur l'environnement", () => {
    const env = { SIGNUP_MODE: "invite", INVITE_CODES: "env-code" };
    expect(resolveSignupPolicy(null, env)).toEqual({
      mode: "invite",
      codes: ["env-code"],
      source: "env",
    });
    expect(resolveSignupPolicy({ signupMode: null, inviteCodes: "x" }, env).source).toBe("env");
    expect(resolveSignupPolicy({ signupMode: "closed", inviteCodes: null }, env)).toEqual({
      mode: "closed",
      codes: [],
      source: "admin",
    });
    expect(
      resolveSignupPolicy({ signupMode: "invite", inviteCodes: "alpha, beta" }, env).codes,
    ).toEqual(["alpha", "beta"]);
  });
});

describe("parseSignupSettings", () => {
  it("codes valides, dédoublonnés ; au moins un en mode invitation", () => {
    expect(parseSignupSettings("invite", " ami-2026, ami-2026 ,voisins")).toEqual({
      ok: true,
      codes: ["ami-2026", "voisins"],
    });
    expect(parseSignupSettings("invite", " , ")).toEqual({
      ok: false,
      message: "Indiquez au moins un code d'invitation.",
    });
    expect(parseSignupSettings("open", "")).toEqual({ ok: true, codes: [] });
    const bad = parseSignupSettings("invite", "ok-code, a b");
    expect(bad.ok).toBe(false);
    expect(parseSignupSettings("closed", "abc").ok).toBe(false);
  });
});
