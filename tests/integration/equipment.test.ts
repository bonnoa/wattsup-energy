import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { equipment, household } from "@/db/schema";
import type { HouseholdContext } from "@/server/context";
import {
  deleteEquipment,
  listEquipment,
  saveEquipment,
  updateSolarBatterySettings,
} from "@/server/equipment";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const panels = {
  label: "Panneaux 3,2 kWc",
  capacity: 3.2,
  installedOn: "2023-06-01",
  costEur: 6400,
};

describe("équipements", () => {
  it("une fiche par type : créer puis remplacer, supprimer", async () => {
    const ctx = await createTestHousehold();
    await saveEquipment(ctx, "solar", panels);
    await saveEquipment(ctx, "battery", {
      label: "Batterie 5,12 kWh",
      capacity: 5.12,
      installedOn: "2024-03-01",
      costEur: 1800,
    });
    await saveEquipment(ctx, "solar", { ...panels, costEur: 6900 });
    const list = await listEquipment(ctx);
    expect(list.map((e) => [e.kind, e.costEur]).sort()).toEqual([
      ["battery", 1800],
      ["solar", 6900],
    ]);
    expect(await deleteEquipment(ctx, "battery")).toBe(true);
    expect((await listEquipment(ctx)).map((e) => e.kind)).toEqual(["solar"]);
  });

  it("réglages : revente avec prix ; sans revente, prix remis à 0 ; autres réglages intacts", async () => {
    const ctx = await createTestHousehold();
    await updateSolarBatterySettings(ctx, {
      exportEnabled: true,
      exportPriceEurKwh: 0.04,
      batteryGridCharging: true,
    });
    const settings = async () =>
      (await db.select().from(household).where(eq(household.id, ctx.householdId)))[0]?.settings;
    expect(await settings()).toMatchObject({
      exportEnabled: true,
      exportPriceEurKwh: 0.04,
      batteryGridCharging: true,
      pelletBagKg: 15,
    });
    await updateSolarBatterySettings(ctx, {
      exportEnabled: false,
      exportPriceEurKwh: 0.04,
      batteryGridCharging: false,
    });
    expect(await settings()).toMatchObject({ exportEnabled: false, exportPriceEurKwh: 0 });
  });
});

const ownedByB = async (b: HouseholdContext) => {
  await saveEquipment(b, "solar", panels);
  return null;
};
const untouched = async (b: HouseholdContext) => {
  const rows = await db.select().from(equipment).where(eq(equipment.householdId, b.householdId));
  expect(rows.map((r) => r.costEur)).toEqual([6400]);
};

describeTenantIsolation("liste des équipements", {
  setup: ownedByB,
  attempt: (a) => listEquipment(a),
  expect: "empty",
});
describeTenantIsolation("modification d'un équipement", {
  setup: ownedByB,
  attempt: async (a) => {
    await saveEquipment(a, "solar", { ...panels, costEur: 1 });
    return [];
  },
  expect: "empty",
  untouched,
});
describeTenantIsolation("suppression d'un équipement", {
  setup: ownedByB,
  attempt: async (a) => ((await deleteEquipment(a, "solar")) ? ["supprimé"] : []),
  expect: "empty",
  untouched,
});
describeTenantIsolation("réglages solaire et batterie", {
  setup: async () => null,
  attempt: async (a) => {
    await updateSolarBatterySettings(a, {
      exportEnabled: true,
      exportPriceEurKwh: 0.1,
      batteryGridCharging: true,
    });
    return [];
  },
  expect: "empty",
  untouched: async (b) => {
    const [row] = await db.select().from(household).where(eq(household.id, b.householdId));
    expect(row?.settings).toMatchObject({ exportEnabled: false, batteryGridCharging: false });
  },
});
