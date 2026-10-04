import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { fuelEvent } from "@/db/schema";
import {
  currentStock,
  isUnitFor,
  type Fuel,
  type FuelEvent,
  type FuelUnit,
} from "@/domain/heating/fuel";
import { zonedInstant } from "@/lib/time";
import type { HouseholdContext } from "./context";

// Saisie des combustibles (T24). Chaque opération filtre par ctx.householdId.

/** Refus métier, message en français pour l'interface. */
export class FuelError extends Error {}

const assertUnit = (fuel: Fuel, unit: FuelUnit) => {
  if (!isUnitFor(fuel, unit)) {
    throw new FuelError(fuel === "wood" ? "le bois se compte en stères" : "unité inconnue");
  }
};

export interface FuelEventRow extends FuelEvent {
  id: string;
}

/** Quantité d'un tap : un sac de granulés, un demi-stère de bois. */
export const QUICK_CONSUMPTION: Record<Fuel, { qty: number; unit: "bag" | "stere" }> = {
  pellet: { qty: 1, unit: "bag" },
  wood: { qty: 0.5, unit: "stere" },
};

const toRow = (r: typeof fuelEvent.$inferSelect): FuelEventRow => ({
  id: r.id,
  fuel: r.fuel,
  type: r.type,
  at: r.at,
  qty: r.qty,
  unit: r.unit,
  priceEur: r.priceEur,
});

/** Tous les événements du foyer, du plus ancien au plus récent (calcul du stock). */
export async function listFuelEvents(ctx: HouseholdContext): Promise<FuelEventRow[]> {
  const rows = await db
    .select()
    .from(fuelEvent)
    .where(eq(fuelEvent.householdId, ctx.householdId))
    .orderBy(asc(fuelEvent.at), asc(fuelEvent.createdAt));
  return rows.map(toRow);
}

/** Stock courant en unité de base (kg ou stère). */
export async function fuelStock(ctx: HouseholdContext, fuel: Fuel, now = new Date()) {
  return currentStock(await listFuelEvents(ctx), fuel, now, ctx.settings);
}

/** Une palette est enregistrée en sacs : le nombre de sacs par palette peut changer. */
function normalize(ctx: HouseholdContext, qty: number, unit: FuelUnit) {
  return unit === "pallet"
    ? { qty: qty * ctx.settings.pelletBagsPerPallet, unit: "bag" as const }
    : { qty, unit };
}

async function insert(
  ctx: HouseholdContext,
  values: Omit<typeof fuelEvent.$inferInsert, "householdId">,
) {
  const [row] = await db
    .insert(fuelEvent)
    .values({ ...values, householdId: ctx.householdId })
    .returning();
  return row ? toRow(row) : null;
}

/** « + Sac versé » / « + ½ stère » : une consommation horodatée maintenant. */
export async function addQuickConsumption(ctx: HouseholdContext, fuel: Fuel, now = new Date()) {
  return insert(ctx, { fuel, type: "consumption", at: now, ...QUICK_CONSUMPTION[fuel] });
}

export interface PurchaseInput {
  fuel: Fuel;
  qty: number;
  unit: FuelUnit;
  priceEur: number | null;
  /** Jour local de l'achat. */
  date: string;
}

/** Achat daté (midi local, pour ne pas changer de jour avec le fuseau). */
export async function addPurchase(ctx: HouseholdContext, input: PurchaseInput) {
  assertUnit(input.fuel, input.unit);
  return insert(ctx, {
    fuel: input.fuel,
    type: "purchase",
    at: zonedInstant(input.date, 12, ctx.timezone),
    ...normalize(ctx, input.qty, input.unit),
    priceEur: input.priceEur,
  });
}

/** « Corriger le stock » : un relevé qui fait foi maintenant. */
export async function setStock(
  ctx: HouseholdContext,
  input: { fuel: Fuel; qty: number; unit: FuelUnit },
  now = new Date(),
) {
  assertUnit(input.fuel, input.unit);
  return insert(ctx, {
    fuel: input.fuel,
    type: "stock_snapshot",
    at: now,
    ...normalize(ctx, input.qty, input.unit),
  });
}

/** Modifie la quantité, l'unité, le prix ou le jour d'un événement du journal. */
export async function updateFuelEvent(
  ctx: HouseholdContext,
  id: string,
  input: { qty: number; unit: FuelUnit; priceEur: number | null; date: string | null },
) {
  const [existing] = await db
    .select()
    .from(fuelEvent)
    .where(and(eq(fuelEvent.id, id), eq(fuelEvent.householdId, ctx.householdId)));
  if (!existing) return null;
  assertUnit(existing.fuel, input.unit);
  const [row] = await db
    .update(fuelEvent)
    .set({
      ...normalize(ctx, input.qty, input.unit),
      priceEur: existing.type === "purchase" ? input.priceEur : null,
      ...(input.date ? { at: zonedInstant(input.date, 12, ctx.timezone) } : {}),
    })
    .where(and(eq(fuelEvent.id, id), eq(fuelEvent.householdId, ctx.householdId)))
    .returning();
  return row ? toRow(row) : null;
}

export async function deleteFuelEvent(ctx: HouseholdContext, id: string): Promise<boolean> {
  const rows = await db
    .delete(fuelEvent)
    .where(and(eq(fuelEvent.id, id), eq(fuelEvent.householdId, ctx.householdId)))
    .returning({ id: fuelEvent.id });
  return rows.length > 0;
}
