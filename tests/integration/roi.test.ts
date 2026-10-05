import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { energyInterval } from "@/db/schema";
import { householdContextFor, type HouseholdContext } from "@/server/context";
import { saveEquipment } from "@/server/equipment";
import { getRoi } from "@/server/queries/roi";
import { seedDemo } from "../../scripts/seed/seed";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const now = new Date("2026-10-03T08:00:00Z");
let ctx: HouseholdContext;

describe("rentabilité sur le foyer de démo", () => {
  beforeAll(async () => {
    const r = await seedDemo({
      email: "roi-test@wattsup.test",
      password: "motdepasse-de-test",
      now,
    });
    ctx = await householdContextFor(r.userId);
  }, 120_000);

  it("solaire et batterie : économies, amortissement projeté, données depuis l'installation", async () => {
    const roi = await getRoi(ctx, now);
    expect(roi.noContract).toBe(false);
    const solar = roi.items.solar;
    const battery = roi.items.battery;
    expect(solar?.savings.totalCents).toBeGreaterThan(0);
    expect(solar?.savings.parts.export).toBe(0); // revente désactivée par défaut
    expect(battery?.savings.totalCents).toBeGreaterThan(0);
    expect(solar?.payback.status).toBe("in-progress");
    expect(solar?.payback.paybackDate && solar.payback.paybackDate > "2026-10-03").toBe(true);
    expect(solar?.dataFrom).toBe("2024-10-03");
    const months = Object.values(solar?.savings.byMonth ?? {}).reduce((a, c) => a + c, 0);
    expect(Math.abs(months - (solar?.savings.totalCents ?? 0))).toBeLessThanOrEqual(30);
  });

  it("revente activée : la ligne export apparaît et l'économie solaire augmente", async () => {
    const base = await getRoi(ctx, now);
    const withExport = await getRoi(
      { ...ctx, settings: { ...ctx.settings, exportEnabled: true, exportPriceEurKwh: 0.05 } },
      now,
    );
    expect(withExport.items.solar?.savings.parts.export).toBeGreaterThan(0);
    expect(withExport.items.solar?.savings.totalCents).toBeGreaterThan(
      base.items.solar?.savings.totalCents ?? 0,
    );
    // La batterie perd la revente de l'énergie solaire qu'elle stocke.
    expect(withExport.items.battery?.savings.parts.lostExport).toBeLessThan(0);
  });

  it("rendement du dernier mois complet comparé aux 12 mois précédents", async () => {
    const roi = await getRoi(ctx, now);
    expect(roi.solarYield?.month).toBe("2026-09");
    expect(roi.solarYield?.yield).toBeGreaterThan(0);
    expect(typeof roi.solarYield?.alert).toBe("boolean");
  });
});

describe("foyer sans contrat ni données", () => {
  it("batterie : mois avec décharge sans charge signalés ; données de démo cohérentes", async () => {
    expect((await getRoi(ctx, now)).items.battery?.gaps).toEqual([]);
    const fresh = await createTestHousehold();
    await saveEquipment(fresh, "battery", {
      label: "Batterie",
      capacity: 5,
      installedOn: "2026-01-01",
      costEur: 2000,
    });
    await db.insert(energyInterval).values(
      ["2026-02-10T19:00:00Z", "2026-03-10T19:00:00Z"].map((start) => ({
        householdId: fresh.householdId,
        metric: "battery_discharge",
        start: new Date(start),
        granularity: "hour" as const,
        kwh: 3,
        source: "csv" as const,
      })),
    );
    expect((await getRoi(fresh, now)).items.battery?.gaps).toEqual([
      { missing: "charge", months: ["2026-02", "2026-03"] },
    ]);
  }, 30_000);

  it("équipement renseigné : économies nulles, pas de date d'amortissement", async () => {
    const fresh = await createTestHousehold();
    await saveEquipment(fresh, "solar", {
      label: "Panneaux",
      capacity: 3,
      installedOn: "2025-01-01",
      costEur: 5000,
    });
    const roi = await getRoi(fresh, now);
    expect(roi.noContract).toBe(true);
    expect(roi.items.solar).toMatchObject({
      dataFrom: null,
      payback: { status: "no-savings", paybackDate: null },
    });
    expect(roi.solarYield).toBeNull();
  });
});

describeTenantIsolation("rentabilité", {
  setup: async (b) => {
    await saveEquipment(b, "battery", {
      label: "Batterie",
      capacity: 5,
      installedOn: "2025-01-01",
      costEur: 2000,
    });
    return null;
  },
  attempt: async (a) => Object.values((await getRoi(a, now)).items),
  expect: "empty",
});
