"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ALERT_LIMITS, parseAlertSettings, type AlertSettings } from "@/domain/alerts";
import { dismissAlert, updateAlertSettings } from "../alerts";
import { getHouseholdContext } from "../context";

const key = z
  .string()
  .regex(/^[a-z_]+(:[a-z]+)?$/)
  .max(40);

/** Masque une alerte à son niveau actuel (« Masquer » sur la carte À surveiller). */
export async function dismissAlertAction(rawKey: string, level: number): Promise<{ ok: boolean }> {
  if (!key.safeParse(rawKey).success || (level !== 1 && level !== 2)) return { ok: false };
  const ctx = await getHouseholdContext();
  await dismissAlert(ctx, rawKey, level);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Activation et seuils (Réglages › Alertes) ; une valeur hors bornes est refusée. */
export async function saveAlertSettingsAction(
  raw: AlertSettings,
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const parsed = parseAlertSettings(raw);
  const errors = Object.entries(ALERT_LIMITS)
    .filter(([name, limit]) => {
      const sent = (raw as unknown as Record<string, Record<string, unknown>>)?.[name];
      const kept = (parsed as unknown as Record<string, Record<string, unknown>>)[name];
      return (
        sent?.[limit.key] !== kept?.[limit.key] ||
        sent?.enabled !== kept?.enabled ||
        sent?.email !== kept?.email
      );
    })
    .map(([, limit]) => `valeur attendue entre ${limit.min} et ${limit.max}`);
  if (errors.length > 0) return { ok: false, errors };
  const ctx = await getHouseholdContext();
  await updateAlertSettings(ctx, parsed);
  revalidatePath("/", "layout");
  return { ok: true };
}
