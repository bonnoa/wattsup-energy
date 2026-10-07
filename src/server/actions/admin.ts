"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AdminError, deleteUserAsAdmin, ForbiddenError, setUserDisabled } from "../admin";
import { getHouseholdContext } from "../context";

export type AdminActionResult = { ok: true } | { ok: false; errors: string[] };

const userId = z.string().min(1).max(100);

async function run(fn: () => Promise<boolean>): Promise<AdminActionResult> {
  try {
    const found = await fn();
    revalidatePath("/admin/utilisateurs");
    return found ? { ok: true } : { ok: false, errors: ["compte introuvable"] };
  } catch (err) {
    if (err instanceof AdminError || err instanceof ForbiddenError) {
      return { ok: false, errors: [err.message] };
    }
    throw err;
  }
}

/** Désactive ou réactive un compte (administrateur seulement). */
export async function setUserDisabledAction(
  id: string,
  disabled: boolean,
): Promise<AdminActionResult> {
  const p = userId.safeParse(id);
  if (!p.success) return { ok: false, errors: ["compte introuvable"] };
  const ctx = await getHouseholdContext();
  return run(() => setUserDisabled(ctx, p.data, disabled === true));
}

/** Supprime un compte et toutes ses données (administrateur seulement). */
export async function deleteUserAction(id: string): Promise<AdminActionResult> {
  const p = userId.safeParse(id);
  if (!p.success) return { ok: false, errors: ["compte introuvable"] };
  const ctx = await getHouseholdContext();
  return run(() => deleteUserAsAdmin(ctx, p.data));
}
