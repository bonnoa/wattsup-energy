// Inscription (SPEC §14, T32) : SIGNUP_MODE=open|invite|closed. En mode invite, un code
// d'INVITE_CODES (liste séparée par des virgules) est exigé. Pur.

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
