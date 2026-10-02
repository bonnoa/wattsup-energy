"use server";

import { revalidatePath } from "next/cache";
import { parseProfile } from "@/domain/profile";
import { getHouseholdContext } from "../context";
import { updateProfile } from "../profile";

export async function updateProfileAction(input: unknown): Promise<{ ok: boolean }> {
  const profile = parseProfile(input);
  if (!profile) return { ok: false };
  const ctx = await getHouseholdContext();
  await updateProfile(ctx, profile);
  // La nav et toutes les pages dépendent du profil.
  revalidatePath("/", "layout");
  return { ok: true };
}
