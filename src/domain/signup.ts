// Inscription (SPEC §14, T32, T39) : open|invite|closed. En mode invite, un des codes
// d'invitation (liste séparée par des virgules) est exigé. Le réglage de l'administrateur
// (table instance_settings) prime ; sans lui, SIGNUP_MODE et INVITE_CODES. Pur.

export type SignupMode = "open" | "invite" | "closed";

/** Mode d'inscription ; absent : ouvert (auto-hébergé), inconnu : fermé par prudence. */
export function parseSignupMode(raw: string | undefined): SignupMode {
  if (raw === undefined || raw.trim() === "") return "open";
  const mode = raw.trim().toLowerCase();
  return mode === "open" || mode === "invite" || mode === "closed" ? mode : "closed";
}

export const parseInviteCodes = (raw: string | undefined) =>
  (raw ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

/** Mode et codes en vigueur, et leur origine (réglage de l'administrateur ou environnement). */
export interface SignupPolicy {
  mode: SignupMode;
  codes: string[];
  source: "admin" | "env";
}

export function resolveSignupPolicy(
  saved: { signupMode: SignupMode | null; inviteCodes: string | null } | null,
  env: Record<string, string | undefined>,
): SignupPolicy {
  if (saved?.signupMode) {
    return {
      mode: saved.signupMode,
      codes: parseInviteCodes(saved.inviteCodes ?? ""),
      source: "admin",
    };
  }
  return {
    mode: parseSignupMode(env.SIGNUP_MODE),
    codes: parseInviteCodes(env.INVITE_CODES),
    source: "env",
  };
}

const CODE_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

/**
 * Codes d'invitation saisis par l'administrateur : séparés par des virgules, de 4 à 64
 * lettres, chiffres, tirets ou soulignés ; au moins un en mode invitation.
 */
export function parseSignupSettings(
  mode: SignupMode,
  rawCodes: string,
): { ok: true; codes: string[] } | { ok: false; message: string } {
  const codes = [...new Set(parseInviteCodes(rawCodes))];
  const bad = codes.find((c) => !CODE_PATTERN.test(c));
  if (bad) {
    return {
      ok: false,
      message: `Code « ${bad} » : 4 à 64 lettres, chiffres, tirets ou soulignés, sans espace.`,
    };
  }
  if (mode === "invite" && codes.length === 0) {
    return { ok: false, message: "Indiquez au moins un code d'invitation." };
  }
  return { ok: true, codes };
}

export function signupAllowed(
  mode: SignupMode,
  code: string | null | undefined,
  codes: readonly string[],
): { ok: true } | { ok: false; message: string } {
  if (mode === "open") return { ok: true };
  if (mode === "closed") return { ok: false, message: "Les inscriptions sont fermées." };
  if (code && codes.includes(code.trim())) return { ok: true };
  return { ok: false, message: "Code d'invitation invalide." };
}

/** Longueur maximale du nom affiché (prénom et nom), à l'inscription comme dans Mon compte. */
export const NAME_MAX = 60;

/** Nom affiché acceptable : non vide une fois les espaces retirés, NAME_MAX caractères au plus. */
export function validName(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const n = name.trim();
  return n.length > 0 && n.length <= NAME_MAX;
}
