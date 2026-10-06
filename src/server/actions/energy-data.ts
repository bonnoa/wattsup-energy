"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getHouseholdContext } from "../context";
import {
  DataError,
  deleteRange,
  deleteValue,
  rangeSummary,
  setValue,
  type RangeInput,
  type ValueKey,
} from "../energy-data";

// Onglet Données : actions minces sur src/server/energy-data.ts.

export type DataActionResult<T = object> = ({ ok: true } & T) | { ok: false; errors: string[] };

const day = z.iso.date("date attendue");
const valueKey = z.object({
  metric: z.string().min(1).max(80),
  start: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  granularity: z.enum(["hour", "day"]),
  tariffSlot: z.enum(["all", "hp", "hc"]),
});
const range = z.object({ metric: z.string().min(1).max(80).nullable(), from: day, to: day });

async function run<T extends object>(
  fn: () => Promise<T | null | false>,
): Promise<DataActionResult<T>> {
  try {
    const result = await fn();
    revalidatePath("/reglages");
    revalidatePath("/");
    return result === null || result === false
      ? { ok: false, errors: ["valeur introuvable"] }
      : { ok: true, ...result };
  } catch (err) {
    if (err instanceof DataError) return { ok: false, errors: [err.message] };
    throw err;
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): { data: T } | { errors: string[] } {
  const r = schema.safeParse(input);
  return r.success ? { data: r.data } : { errors: r.error.issues.map((i) => i.message) };
}

export async function setValueAction(key: unknown, kwh: unknown): Promise<DataActionResult> {
  const k = parse<ValueKey>(valueKey, key);
  if ("errors" in k) return { ok: false, errors: k.errors };
  if (typeof kwh !== "number") return { ok: false, errors: ["valeur attendue"] };
  const ctx = await getHouseholdContext();
  return run(async () => ((await setValue(ctx, k.data, kwh)) ? {} : null));
}

export async function deleteValueAction(key: unknown): Promise<DataActionResult> {
  const k = parse<ValueKey>(valueKey, key);
  if ("errors" in k) return { ok: false, errors: k.errors };
  const ctx = await getHouseholdContext();
  return run(async () => ((await deleteValue(ctx, k.data)) ? {} : null));
}

export async function rangeSummaryAction(
  input: unknown,
): Promise<DataActionResult<{ count: number; kwh: number }>> {
  const r = parse<RangeInput>(range, input);
  if ("errors" in r) return { ok: false, errors: r.errors };
  const ctx = await getHouseholdContext();
  return run(() => rangeSummary(ctx, r.data));
}

export async function deleteRangeAction(
  input: unknown,
): Promise<DataActionResult<{ deleted: number }>> {
  const r = parse<RangeInput>(range, input);
  if ("errors" in r) return { ok: false, errors: r.errors };
  const ctx = await getHouseholdContext();
  return run(async () => ({ deleted: await deleteRange(ctx, r.data) }));
}
