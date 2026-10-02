"use server";

import { revalidatePath } from "next/cache";
import { getHouseholdContext } from "../context";
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
