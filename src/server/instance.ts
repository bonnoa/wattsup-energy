import { db } from "@/db";
import { instanceSettings } from "@/db/schema";
import { resolveSignupPolicy, type SignupMode, type SignupPolicy } from "@/domain/signup";
import { requireAdmin } from "./admin";
import type { HouseholdContext } from "./context";

// Réglages de l'instance (SPEC §5, T39) : une ligne unique, modifiée par l'administrateur
// depuis la page Utilisateurs. Tant qu'elle n'existe pas, les variables d'environnement
// s'appliquent (SIGNUP_MODE, INVITE_CODES).

/** Mode d'inscription en vigueur, lu à chaque appel (inscription, pages publiques). */
export async function getSignupPolicy(
  env: Record<string, string | undefined> = process.env,
): Promise<SignupPolicy> {
  const [row] = await db
    .select({
      signupMode: instanceSettings.signupMode,
      inviteCodes: instanceSettings.inviteCodes,
    })
    .from(instanceSettings);
  return resolveSignupPolicy(row ?? null, env);
}

/** Enregistre le mode d'inscription et les codes (validés par parseSignupSettings). */
export async function updateSignupPolicy(
  ctx: HouseholdContext,
  input: { mode: SignupMode; codes: string[] },
): Promise<void> {
  requireAdmin(ctx);
  const values = { signupMode: input.mode, inviteCodes: input.codes.join(",") };
  await db
    .insert(instanceSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: instanceSettings.id, set: values });
}
