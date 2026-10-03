import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { household, type HouseholdLocation } from "@/db/schema";
import { cellOf, roundCoord } from "@/domain/weather";
import type { HouseholdContext } from "./context";
import { weatherStatus } from "./weather/sync";

const locationInput = z.object({
  label: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export function parseLocation(input: unknown): HouseholdLocation | null {
  const r = locationInput.safeParse(input);
  if (!r.success) return null;
  return { label: r.data.label, lat: roundCoord(r.data.lat), lon: roundCoord(r.data.lon) };
}

/** Enregistre la commune du foyer, coordonnées arrondies à 0,01° (SPEC §7.9). */
export async function setLocation(ctx: HouseholdContext, location: HouseholdLocation) {
  const rounded = { ...location, lat: roundCoord(location.lat), lon: roundCoord(location.lon) };
  const [row] = await db
    .update(household)
    .set({ location: rounded })
    .where(eq(household.id, ctx.householdId))
    .returning({ location: household.location });
  return row?.location ?? null;
}

/** Commune du foyer et état de sa météo, ou null si aucune commune n'est enregistrée. */
export async function getLocationStatus(ctx: HouseholdContext) {
  const [row] = await db
    .select({ location: household.location })
    .from(household)
    .where(eq(household.id, ctx.householdId));
  if (!row?.location) return null;
  return { location: row.location, ...(await weatherStatus(cellOf(row.location))) };
}
