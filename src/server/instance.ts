import { db } from "@/db";
import { instanceSettings } from "@/db/schema";
import { resolveContactTexts, type ContactTexts } from "@/domain/instance-texts";
import { resolveSignupPolicy, type SignupMode, type SignupPolicy } from "@/domain/signup";
import { requireAdmin } from "./admin";
import type { HouseholdContext } from "./context";

// Réglages de l'instance (SPEC §5, T39, T53) : une ligne unique, modifiée par
// l'administrateur (mode d'inscription depuis Utilisateurs, textes de la page Contact depuis
// Paramètres). Tant qu'elle n'existe pas, les variables d'environnement s'appliquent
// (SIGNUP_MODE, INVITE_CODES) et la page Contact reste neutre.

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

/** Intitulé de l'entrée Contact et texte de la page Contact (menu, page, Paramètres). */
export async function getContactTexts(): Promise<ContactTexts> {
  const [row] = await db
    .select({
      contactLabel: instanceSettings.contactLabel,
      contactNotice: instanceSettings.contactNotice,
    })
    .from(instanceSettings);
  return resolveContactTexts(row ?? null);
}

/** Enregistre les textes de la page Contact (validés par parseContactTexts). */
export async function updateContactTexts(
  ctx: HouseholdContext,
  input: { label: string | null; notice: string | null },
): Promise<void> {
  requireAdmin(ctx);
  const values = { contactLabel: input.label, contactNotice: input.notice };
  await db
    .insert(instanceSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: instanceSettings.id, set: values });
}
