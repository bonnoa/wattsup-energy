import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { equipment, household, type HouseholdSettings } from "@/db/schema";
import type { HouseholdContext } from "./context";

// Équipements amortis et réglages solaire / batterie (T28). Chaque opération filtre par
// ctx.householdId.

export type EquipmentKind = "solar" | "battery";

export interface EquipmentInput {
  label: string;
  /** kWc (solaire) ou kWh (batterie) ; null si inconnue. */
  capacity: number | null;
  installedOn: string;
  costEur: number;
}

export interface Equipment extends EquipmentInput {
  id: string;
  kind: EquipmentKind;
}

export async function listEquipment(ctx: HouseholdContext): Promise<Equipment[]> {
  const rows = await db.select().from(equipment).where(eq(equipment.householdId, ctx.householdId));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    capacity: r.capacity,
    installedOn: r.installedOn,
    costEur: r.costEur,
  }));
}

/** Crée ou remplace la fiche de l'équipement de ce type (un par foyer). */
export async function saveEquipment(
  ctx: HouseholdContext,
  kind: EquipmentKind,
  input: EquipmentInput,
) {
  const [row] = await db
    .insert(equipment)
    .values({ householdId: ctx.householdId, kind, ...input })
    .onConflictDoUpdate({ target: [equipment.householdId, equipment.kind], set: input })
    .returning({ id: equipment.id });
  return row ?? null;
}

export async function deleteEquipment(ctx: HouseholdContext, kind: EquipmentKind) {
  const rows = await db
    .delete(equipment)
    .where(and(eq(equipment.householdId, ctx.householdId), eq(equipment.kind, kind)))
    .returning({ id: equipment.id });
  return rows.length > 0;
}

export type SolarBatterySettings = Pick<
  HouseholdSettings,
  "exportEnabled" | "exportPriceEurKwh" | "batteryGridCharging"
>;

/** Revente du surplus et charge de la batterie depuis le réseau (fusion dans les réglages). */
export async function updateSolarBatterySettings(
  ctx: HouseholdContext,
  input: SolarBatterySettings,
) {
  // Revente désactivée : prix remis à 0, l'export compte alors 0 € (SPEC §7.2).
  const patch: SolarBatterySettings = {
    ...input,
    exportPriceEurKwh: input.exportEnabled ? input.exportPriceEurKwh : 0,
  };
  const [row] = await db
    .update(household)
    .set({ settings: sql`${household.settings} || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(household.id, ctx.householdId))
    .returning({ settings: household.settings });
  return row?.settings ?? null;
}
