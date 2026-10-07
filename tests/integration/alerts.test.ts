import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { alertDismissal, household } from "@/db/schema";
import { DEFAULT_ALERT_SETTINGS } from "@/domain/alerts";
import { dismissAlert, getAlerts, updateAlertSettings } from "@/server/alerts";
import { householdContextFor, type HouseholdContext } from "@/server/context";
import { addPurchase, addQuickConsumption } from "@/server/fuel";
import { updateProfile } from "@/server/profile";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const NOW = new Date("2026-10-20T12:00:00Z");
const DAY = 86_400_000;

/** Foyer aux granulés : 10 sacs achetés, 1 sac versé par jour depuis 3 semaines → 9 sacs ≈ 9 jours. */
async function pelletHousehold(): Promise<HouseholdContext> {
  const base = await createTestHousehold("alertes");
  await updateProfile(base, { ...base.profile, pellet: true });
  const ctx = await householdContextFor(base.userId);
  await addPurchase(ctx, {
    fuel: "pellet",
    qty: 30,
    unit: "bag",
    priceEur: null,
    date: "2026-09-25",
  });
  for (let d = 21; d >= 1; d--)
    await addQuickConsumption(ctx, "pellet", new Date(NOW.getTime() - d * DAY));
  return ctx;
}

describe("alertes", () => {
  it("stock bas : alerte, masquée puis de retour quand elle s'aggrave", async () => {
    const ctx = await pelletHousehold();
    const [alert] = await getAlerts(ctx, NOW);
    expect(alert).toMatchObject({ key: "fuel_stock:pellet", level: 1 });
    expect(alert?.text).toContain("9 jours");

    await dismissAlert(ctx, "fuel_stock:pellet", 1, NOW);
    expect(await getAlerts(ctx, NOW)).toEqual([]);

    // 3 sacs de plus versés : moins d'une semaine de stock, niveau 2.
    for (let i = 0; i < 3; i++) await addQuickConsumption(ctx, "pellet", NOW);
    expect((await getAlerts(ctx, NOW))[0]?.level).toBe(2);
  });

  it("cause réglée : l'alerte disparaît et son masquage est effacé", async () => {
    const ctx = await pelletHousehold();
    await dismissAlert(ctx, "fuel_stock:pellet", 1, NOW);
    await addPurchase(ctx, {
      fuel: "pellet",
      qty: 60,
      unit: "bag",
      priceEur: null,
      date: "2026-10-19",
    });
    expect(await getAlerts(ctx, NOW)).toEqual([]);
    expect(await db.$count(alertDismissal, eq(alertDismissal.householdId, ctx.householdId))).toBe(
      0,
    );
  });

  it("réglages : alerte coupée ; module absent du profil : rien", async () => {
    const ctx = await pelletHousehold();
    const off = { ...DEFAULT_ALERT_SETTINGS, fuelStock: { enabled: false, weeks: 3 } };
    await updateAlertSettings(ctx, off);
    expect(await getAlerts(await householdContextFor(ctx.userId), NOW)).toEqual([]);
    await updateAlertSettings(ctx, DEFAULT_ALERT_SETTINGS);
    const noPellet = { ...ctx, profile: { ...ctx.profile, pellet: false } };
    expect(await getAlerts(noPellet, NOW)).toEqual([]);
  });
});

describeTenantIsolation("alertes : masquage", {
  setup: async (b) => {
    await dismissAlert(b, "ha_silent", 1, NOW);
    return b;
  },
  attempt: async (a) => {
    await dismissAlert(a, "ha_silent", 2, NOW);
    return null;
  },
  expect: "empty",
  untouched: async (b) => {
    const [row] = await db
      .select()
      .from(alertDismissal)
      .where(eq(alertDismissal.householdId, b.householdId));
    expect(row?.level).toBe(1);
  },
});

describeTenantIsolation("alertes : réglages", {
  setup: async (b) => b,
  attempt: async (a) => {
    await updateAlertSettings(a, {
      ...DEFAULT_ALERT_SETTINGS,
      budget: { enabled: false, percent: 50 },
    });
    return null;
  },
  expect: "empty",
  untouched: async (b) => {
    const [row] = await db
      .select({ settings: household.settings })
      .from(household)
      .where(eq(household.id, b.householdId));
    expect(row?.settings.alerts).toBeUndefined();
  },
});
