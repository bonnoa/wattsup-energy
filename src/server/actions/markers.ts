"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MARKER_KINDS, MARKER_TEXT_MAX } from "@/domain/markers";
import { getHouseholdContext } from "../context";
import { createMarker, deleteMarker, MarkerError, updateMarker } from "../markers";

export type MarkerActionResult = { ok: true } | { ok: false; errors: string[] };

const day = z.iso.date("date attendue");
const input = z.object({
  kind: z.enum(MARKER_KINDS, "type inconnu"),
  text: z.string().max(MARKER_TEXT_MAX, `${MARKER_TEXT_MAX} caractères au plus`),
  startDate: day,
  endDate: day.nullable(),
});

async function run(fn: () => Promise<unknown>): Promise<MarkerActionResult> {
  try {
    const result = await fn();
    revalidatePath("/");
    return result === null || result === false
      ? { ok: false, errors: ["repère introuvable"] }
      : { ok: true };
  } catch (err) {
    if (err instanceof MarkerError) return { ok: false, errors: [err.message] };
    throw err;
  }
}

/** Ajoute un repère, ou modifie celui dont l'id est donné. */
export async function saveMarkerAction(
  id: string | null,
  raw: unknown,
): Promise<MarkerActionResult> {
  const p = input.safeParse(raw);
  if (!p.success) return { ok: false, errors: p.error.issues.map((i) => i.message) };
  const ctx = await getHouseholdContext();
  return run(() => (id ? updateMarker(ctx, id, p.data) : createMarker(ctx, p.data)));
}

export async function deleteMarkerAction(id: string): Promise<MarkerActionResult> {
  const ctx = await getHouseholdContext();
  return run(() => deleteMarker(ctx, id));
}
