"use server";

import { revalidatePath } from "next/cache";
import { getHouseholdContext } from "../context";
import { updateGranularity } from "../household";
import { createIngestToken, revokeIngestToken, type CreatedToken } from "../ingest/token";

export async function createIngestTokenAction(): Promise<CreatedToken> {
  const ctx = await getHouseholdContext();
  const created = await createIngestToken(ctx);
  revalidatePath("/reglages");
  return created;
}

export async function revokeIngestTokenAction(): Promise<void> {
  const ctx = await getHouseholdContext();
  await revokeIngestToken(ctx);
  revalidatePath("/reglages");
}

export async function setGranularityAction(granularity: unknown): Promise<{ ok: boolean }> {
  if (granularity !== "hourly" && granularity !== "daily") return { ok: false };
  const ctx = await getHouseholdContext();
  await updateGranularity(ctx, granularity);
  revalidatePath("/", "layout");
  return { ok: true };
}
