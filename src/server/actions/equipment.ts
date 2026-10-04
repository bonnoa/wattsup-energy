"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getHouseholdContext } from "../context";
import { deleteEquipment, saveEquipment, updateSolarBatterySettings } from "../equipment";

export type EquipmentActionResult = { ok: true } | { ok: false; errors: string[] };

const kind = z.enum(["solar", "battery"]);
const equipmentInput = z.object({
  label: z.string().trim().min(1, "libellé requis").max(60, "60 caractères au plus"),
  capacity: z
    .number("capacité attendue")
    .positive("capacité positive attendue")
    .max(1000)
    .nullable(),
  installedOn: z.iso.date("date d'installation attendue"),
  costEur: z.number("coût attendu").nonnegative("coût positif attendu").max(1_000_000),
});
const settingsInput = z.object({
  exportEnabled: z.boolean(),
  exportPriceEurKwh: z.number("prix attendu").nonnegative("prix positif attendu").max(2),
  batteryGridCharging: z.boolean(),
});

const errors = (e: z.ZodError) => ({ ok: false as const, errors: e.issues.map((i) => i.message) });

export async function saveEquipmentAction(
  rawKind: unknown,
  input: unknown,
): Promise<EquipmentActionResult> {
  const k = kind.safeParse(rawKind);
  const p = equipmentInput.safeParse(input);
  if (!k.success) return errors(k.error);
  if (!p.success) return errors(p.error);
  const ctx = await getHouseholdContext();
  await saveEquipment(ctx, k.data, p.data);
  revalidatePath("/rentabilite");
  return { ok: true };
}

export async function deleteEquipmentAction(rawKind: unknown): Promise<EquipmentActionResult> {
  const k = kind.safeParse(rawKind);
  if (!k.success) return errors(k.error);
  const ctx = await getHouseholdContext();
  await deleteEquipment(ctx, k.data);
  revalidatePath("/rentabilite");
  return { ok: true };
}

export async function updateSolarBatterySettingsAction(
  input: unknown,
): Promise<EquipmentActionResult> {
  const p = settingsInput.safeParse(input);
  if (!p.success) return errors(p.error);
  const ctx = await getHouseholdContext();
  await updateSolarBatterySettings(ctx, p.data);
  revalidatePath("/", "layout");
  return { ok: true };
}
