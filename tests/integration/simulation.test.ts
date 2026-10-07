import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { energyInterval } from "@/db/schema";
import { CONTRACT_PRESETS } from "@/domain/tariff/schema";
import { createContract } from "@/server/contracts";
import type { HouseholdContext } from "@/server/context";
import { saveEquipment } from "@/server/equipment";
import { runSimulation } from "@/server/simulation";
import { zonedInstant } from "@/lib/time";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const NOW = new Date("2026-10-07T12:00:00Z");
const base = CONTRACT_PRESETS.find((p) => p.contract.kind === "base");

/** 60 jours : surplus de 3 kWh à midi, 2 kWh achetés à 20 h ; 3 kWc installés. */
async function solarHousehold(): Promise<HouseholdContext> {
  const ctx = await createTestHousehold("simulation");
  if (!base) throw new Error("préréglage Base manquant");
  await createContract(ctx, {
    name: base.name,
    contract: base.contract,
    subscription: { startDate: "2025-01-01", endDate: null },
  });
  await saveEquipment(ctx, "solar", {
    label: "PV",
    capacity: 3,
    installedOn: "2025-01-01",
    costEur: 6000,
  });
  const rows: (typeof energyInterval.$inferInsert)[] = [];
  for (let d = 1; d <= 60; d++) {
    const date = new Date(Date.UTC(2026, 7, d)).toISOString().slice(0, 10);
    const row = (hour: number, metric: string, kwh: number) => ({
      householdId: ctx.householdId,
      start: zonedInstant(date, hour, "Europe/Paris"),
      granularity: "hour" as const,
      metric,
      kwh,
      source: "ha" as const,
    });
    rows.push(row(12, "solar_production", 4), row(12, "grid_export", 3), row(12, "grid_import", 0));
    rows.push(row(20, "grid_import", 2), row(20, "grid_export", 0));
  }
  await db.insert(energyInterval).values(rows);
  return ctx;
}

describe("simulateur", () => {
  it("batterie : achats du soir évités, économie annualisée et amortissement", async () => {
    const ctx = await solarHousehold();
    const v = await runSimulation(
      ctx,
      { battery: { capacityKwh: 5, powerKw: 3, costEur: 3000 }, panels: null },
      NOW,
    );
    if (v.status !== "ok") throw new Error(v.status);
    expect(v.days).toBe(60);
    // 2 kWh évités chaque soir (2,7 restitués possibles), ramenés à un an.
    expect(v.annual.importAvoidedKwh).toBeCloseTo((2 * 60 * 365) / 60);
    expect(v.annual.savingsCents).toBeGreaterThan(0);
    expect(v.paybackYears).toBeCloseTo(3000 / (v.annual.savingsCents / 100));
    expect(v.selfConsumption.before).toBeCloseTo(0.25);
  });

  it("panneaux sans capacité installée connue, ou sans contrat : indisponible", async () => {
    const ctx = await solarHousehold();
    await saveEquipment(ctx, "solar", {
      label: "PV",
      capacity: null,
      installedOn: "2025-01-01",
      costEur: 1,
    });
    const v = await runSimulation(ctx, { battery: null, panels: { kwc: 2, costEur: 2000 } }, NOW);
    expect(v).toMatchObject({ status: "unavailable", reason: "no-solar-capacity" });
    const empty = await createTestHousehold("vide");
    const e = await runSimulation(
      empty,
      { battery: { capacityKwh: 5, powerKw: 3, costEur: 1 }, panels: null },
      NOW,
    );
    expect(e).toMatchObject({ status: "unavailable", reason: "no-contract" });
  });
});

describeTenantIsolation("simulateur", {
  setup: async (b) => {
    await solarHousehold();
    return b;
  },
  // A n'a ni contrat ni données : rien de B ne doit être rejoué.
  attempt: async (a) => {
    const v = await runSimulation(
      a,
      { battery: { capacityKwh: 5, powerKw: 3, costEur: 1 }, panels: null },
      NOW,
    );
    return v.status === "ok" ? v : null;
  },
  expect: "empty",
});
