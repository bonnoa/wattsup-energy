"use server";

import { redirect } from "next/navigation";
import { getHouseholdContext } from "../context";
import { setOnboarding } from "../household";
import { getLastPushAt } from "../ingest/status";

// Profil, commune, contrat, Home Assistant, historique (src/app/(app)/bienvenue/steps.ts).
const ONBOARDING_STEPS = 5;

/** Mémorise l'étape atteinte (le parcours reprend là où on l'a laissé). */
export async function saveOnboardingStepAction(step: unknown): Promise<{ ok: boolean }> {
  if (typeof step !== "number" || !Number.isInteger(step) || step < 0 || step >= ONBOARDING_STEPS)
    return { ok: false };
  const ctx = await getHouseholdContext();
  await setOnboarding(ctx, { step, done: false });
  return { ok: true };
}

/** Terminer ou passer le parcours : direction le tableau de bord. */
export async function finishOnboardingAction(): Promise<void> {
  const ctx = await getHouseholdContext();
  await setOnboarding(ctx, { step: ctx.onboarding.step, done: true });
  redirect("/");
}

/** Relancer le parcours depuis Réglages. */
export async function restartOnboardingAction(): Promise<void> {
  const ctx = await getHouseholdContext();
  await setOnboarding(ctx, { step: 0, done: false });
  redirect("/bienvenue");
}

/** Attente du premier envoi de Home Assistant (interrogée toutes les quelques secondes). */
export async function lastPushAction(): Promise<string | null> {
  const ctx = await getHouseholdContext();
  return (await getLastPushAt(ctx))?.toISOString() ?? null;
}
