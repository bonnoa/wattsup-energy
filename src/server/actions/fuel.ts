"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getHouseholdContext } from "../context";
import {
  addPastConsumption,
  addPurchase,
  addQuickConsumption,
  deleteFuelEvent,
  FuelError,
  setStock,
  updateFuelEvent,
} from "../fuel";

export type FuelActionResult = { ok: true; id?: string } | { ok: false; errors: string[] };

const fuel = z.enum(["pellet", "wood"]);
const unit = z.enum(["bag", "pallet", "kg", "stere"], "unité inconnue");
const qty = z.number("quantité attendue").positive("quantité positive attendue").max(100_000);
const price = z
  .number("prix attendu")
  .nonnegative("prix positif attendu")
  .max(1_000_000)
  .nullable();
const day = z.iso.date("date attendue");

const fail = (errors: string[]): FuelActionResult => ({ ok: false, errors });

async function run(fn: () => Promise<{ id: string } | boolean | null>): Promise<FuelActionResult> {
  try {
    const result = await fn();
    revalidatePath("/chauffage");
    if (result === null || result === false) return fail(["événement introuvable"]);
    return typeof result === "object" ? { ok: true, id: result.id } : { ok: true };
  } catch (err) {
    if (err instanceof FuelError) return fail([err.message]);
    throw err;
  }
}

type Parsed<T> = { ok: true; data: T } | { ok: false; errors: string[] };

function parse<T>(schema: z.ZodType<T>, input: unknown): Parsed<T> {
  const r = schema.safeParse(input);
  return r.success
    ? { ok: true, data: r.data }
    : { ok: false, errors: r.error.issues.map((i) => i.message) };
}

/** « + Sac versé » / « + ½ stère ». */
export async function quickConsumptionAction(input: unknown): Promise<FuelActionResult> {
  const p = parse(fuel, input);
  if (!p.ok) return fail(p.errors);
  const ctx = await getHouseholdContext();
  return run(() => addQuickConsumption(ctx, p.data));
}

export async function purchaseAction(input: unknown): Promise<FuelActionResult> {
  const p = parse(z.object({ fuel, qty, unit, priceEur: price, date: day }), input);
  if (!p.ok) return fail(p.errors);
  const ctx = await getHouseholdContext();
  return run(() => addPurchase(ctx, p.data));
}

/** « Consommation passée » : total d'un mois terminé. */
export async function pastConsumptionAction(input: unknown): Promise<FuelActionResult> {
  const p = parse(
    z.object({
      fuel,
      qty,
      unit,
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "mois attendu"),
    }),
    input,
  );
  if (!p.ok) return fail(p.errors);
  const ctx = await getHouseholdContext();
  return run(() => addPastConsumption(ctx, p.data));
}

/** « Corriger le stock ». */
export async function setStockAction(input: unknown): Promise<FuelActionResult> {
  const p = parse(z.object({ fuel, qty: qty.or(z.literal(0)), unit }), input);
  if (!p.ok) return fail(p.errors);
  const ctx = await getHouseholdContext();
  return run(() => setStock(ctx, p.data));
}

export async function updateFuelEventAction(id: string, input: unknown): Promise<FuelActionResult> {
  const p = parse(
    z.object({ qty: qty.or(z.literal(0)), unit, priceEur: price, date: day.nullable() }),
    input,
  );
  if (!p.ok) return fail(p.errors);
  const ctx = await getHouseholdContext();
  return run(() => updateFuelEvent(ctx, id, p.data));
}

/** Supprime un événement (aussi « Annuler » après un sac versé). */
export async function deleteFuelEventAction(id: string): Promise<FuelActionResult> {
  const ctx = await getHouseholdContext();
  return run(() => deleteFuelEvent(ctx, id));
}
