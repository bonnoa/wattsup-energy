import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import type { Theme } from "@/domain/theme";
import type { HouseholdContext } from "./context";

// Préférences du compte (SPEC §9, Mon compte). Toujours sur le compte du contexte.

/** Thème de l'interface (T43). */
export async function setTheme(ctx: HouseholdContext, theme: Theme): Promise<void> {
  await db.update(user).set({ theme }).where(eq(user.id, ctx.userId));
}
