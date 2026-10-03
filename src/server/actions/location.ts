"use server";

import { revalidatePath } from "next/cache";
import type { CommuneResult } from "@/domain/weather";
import { cellOf } from "@/domain/weather";
import { getHouseholdContext } from "../context";
import { parseLocation, setLocation } from "../location";
import { OpenMeteoSource } from "../weather/open-meteo";
import { backfillCell, weatherSyncEnabled } from "../weather/sync";

export async function searchCommunesAction(query: unknown): Promise<CommuneResult[]> {
  await getHouseholdContext();
  if (typeof query !== "string" || query.trim().length < 2) return [];
  if (!weatherSyncEnabled()) return [];
  try {
    return await new OpenMeteoSource().searchCommunes(query.trim().slice(0, 80));
  } catch {
    return [];
  }
}

export type SetLocationResult =
  { ok: false } | { ok: true; weather: "ready" | "pending" | "disabled" };

/** Enregistre la commune puis remplit l'historique météo de sa maille (non bloquant en cas d'échec). */
export async function setLocationAction(input: unknown): Promise<SetLocationResult> {
  const location = parseLocation(input);
  if (!location) return { ok: false };
  const ctx = await getHouseholdContext();
  await setLocation(ctx, location);
  let weather: "ready" | "pending" | "disabled" = "disabled";
  if (weatherSyncEnabled()) {
    try {
      await backfillCell(new OpenMeteoSource(), cellOf(location));
      weather = "ready";
    } catch {
      weather = "pending"; // repris par la synchronisation du matin
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, weather };
}
