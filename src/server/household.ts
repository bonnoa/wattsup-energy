import { eq } from "drizzle-orm";
import { db } from "@/db";
import { household } from "@/db/schema";

/** Renvoie le foyer de l'utilisateur, en le créant s'il n'existe pas encore. */
export async function ensureHousehold(userId: string) {
  await db.insert(household).values({ ownerId: userId }).onConflictDoNothing({
    target: household.ownerId,
  });
  const [row] = await db.select().from(household).where(eq(household.ownerId, userId));
  if (!row) throw new Error(`foyer introuvable pour ${userId}`);
  return row;
}

export async function updateGranularity(
  ctx: { householdId: string },
  granularity: "hourly" | "daily",
) {
  const [row] = await db
    .update(household)
    .set({ granularity })
    .where(eq(household.id, ctx.householdId))
    .returning({ granularity: household.granularity });
  return row?.granularity ?? null;
}

/** Parcours de bienvenue : étape atteinte (0–4), fin, ou relance depuis la page Compte. */
export async function setOnboarding(
  ctx: { householdId: string },
  state: { step: number; done: boolean },
) {
  const [row] = await db
    .update(household)
    .set({ onboardingStep: state.step, onboardingDone: state.done })
    .where(eq(household.id, ctx.householdId))
    .returning({ step: household.onboardingStep, done: household.onboardingDone });
  return row ?? null;
}
