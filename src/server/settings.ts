import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { household, type HouseholdSettings } from "@/db/schema";
import type { HouseholdContext } from "./context";

// Réglages des combustibles (T32) : poids du sac, sacs par palette, saison de chauffe,
// équivalences kWh. Fusionnés dans household.settings.

export type FuelSettings = Pick<
  HouseholdSettings,
  "pelletBagKg" | "pelletBagsPerPallet" | "heatingSeason" | "kwhFactors"
>;

export async function updateFuelSettings(ctx: HouseholdContext, input: FuelSettings) {
  const [row] = await db
    .update(household)
    .set({ settings: sql`${household.settings} || ${JSON.stringify(input)}::jsonb` })
    .where(eq(household.id, ctx.householdId))
    .returning({ settings: household.settings });
  return row?.settings ?? null;
}
