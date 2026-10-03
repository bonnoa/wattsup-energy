"use server";

import { revalidatePath } from "next/cache";
import { parseCategoryInput } from "@/domain/categories";
import { CategoryError, createCategory, deleteCategory, updateCategory } from "../categories";
import { getHouseholdContext } from "../context";

export type CategoryActionResult = { ok: true } | { ok: false; errors: string[] };

async function run(fn: () => Promise<unknown>): Promise<CategoryActionResult> {
  try {
    const result = await fn();
    revalidatePath("/reglages");
    return result === null || result === false
      ? { ok: false, errors: ["poste introuvable"] }
      : { ok: true };
  } catch (err) {
    if (err instanceof CategoryError) return { ok: false, errors: [err.message] };
    throw err;
  }
}

/** Crée (id null) ou modifie un poste de consommation. */
export async function saveCategoryAction(
  id: string | null,
  input: unknown,
): Promise<CategoryActionResult> {
  const parsed = parseCategoryInput(input);
  if (!parsed.success) return { ok: false, errors: parsed.errors };
  const ctx = await getHouseholdContext();
  return run(() => (id ? updateCategory(ctx, id, parsed.data) : createCategory(ctx, parsed.data)));
}

export async function deleteCategoryAction(id: string): Promise<CategoryActionResult> {
  const ctx = await getHouseholdContext();
  return run(() => deleteCategory(ctx, id));
}
