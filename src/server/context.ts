import { cache } from "react";
import type { EnergyProfile, HouseholdSettings } from "@/db/schema";
import { ensureHousehold } from "./household";
import { getSession } from "./session";

// Seul point d'accès aux données métier (SPEC §5). Convention : chaque opération
// serveur s'écrit `operation(ctx, input)` et filtre par ctx.householdId ; la Server
// Action exposée à l'UI se contente d'appeler getHouseholdContext() puis l'opération.
// Le harnais tests/helpers/tenancy.ts vérifie l'isolation sur ces opérations.

export interface HouseholdContext {
  userId: string;
  /** Prénom affiché ; vide hors requête web (tests, scripts). */
  userName: string;
  /** Email du compte ; vide hors requête web. */
  userEmail: string;
  /** Administrateur de l'instance (SPEC §5, `user.is_admin`). */
  isAdmin: boolean;
  householdName: string;
  householdId: string;
  timezone: string;
  granularity: "hourly" | "daily";
  profile: EnergyProfile;
  settings: HouseholdSettings;
  /** Parcours de bienvenue : étape atteinte et fin (terminé ou passé). */
  onboarding: { step: number; done: boolean };
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("non authentifié");
  }
}

export async function householdContextFor(
  userId: string,
  userName = "",
  userEmail = "",
  isAdmin = false,
): Promise<HouseholdContext> {
  const home = await ensureHousehold(userId);
  return {
    userId,
    userName,
    userEmail,
    isAdmin,
    householdName: home.name,
    householdId: home.id,
    timezone: home.timezone,
    granularity: home.granularity,
    profile: home.profile,
    settings: home.settings,
    onboarding: { step: home.onboardingStep, done: home.onboardingDone },
  };
}

/**
 * Contexte de l'utilisateur connecté ; lève UnauthorizedError sans session valide.
 * Mis en cache pour la durée d'une requête (layout et page le partagent).
 */
export const getHouseholdContext = cache(async (): Promise<HouseholdContext> => {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return householdContextFor(
    session.user.id,
    session.user.name,
    session.user.email,
    session.user.isAdmin === true,
  );
});
