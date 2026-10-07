"use server";

import { revalidatePath } from "next/cache";
import { THEMES, type Theme } from "@/domain/theme";
import { getHouseholdContext } from "../context";
import { setTheme } from "../preferences";

/** Thème de l'interface du compte connecté (Mon compte). */
export async function setThemeAction(theme: Theme): Promise<{ ok: boolean }> {
  if (!THEMES.includes(theme)) return { ok: false };
  const ctx = await getHouseholdContext();
  await setTheme(ctx, theme);
  revalidatePath("/", "layout");
  return { ok: true };
}
