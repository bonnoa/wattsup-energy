"use server";

import { OVERVIEW_BLOCKS, type OverviewBlock } from "@/domain/overview-blocks";
import { getHouseholdContext } from "../context";
import { setOverviewBlockHidden } from "../overview-prefs";

/**
 * Masque ou réaffiche un bloc de la Vue d'ensemble. Pas de revalidation : sur la Vue
 * d'ensemble, le message « bloc masqué » reste à sa place jusqu'au prochain affichage.
 */
export async function setOverviewBlockAction(
  block: OverviewBlock,
  hidden: boolean,
): Promise<{ ok: boolean }> {
  if (!OVERVIEW_BLOCKS.some((b) => b.id === block) || typeof hidden !== "boolean") {
    return { ok: false };
  }
  const ctx = await getHouseholdContext();
  await setOverviewBlockHidden(ctx, block, hidden);
  return { ok: true };
}
