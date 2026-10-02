import { eq } from "drizzle-orm";
import { db } from "@/db";
import { household } from "@/db/schema";
import type { EnergyProfile } from "@/domain/profile";
import type { HouseholdContext } from "./context";

export async function updateProfile(ctx: HouseholdContext, profile: EnergyProfile) {
  const [row] = await db
    .update(household)
    .set({ profile })
    .where(eq(household.id, ctx.householdId))
    .returning({ profile: household.profile });
  return row?.profile ?? null;
}
