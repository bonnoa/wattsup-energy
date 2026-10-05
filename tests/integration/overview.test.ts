import { and, eq, gte, lt, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { energyInterval } from "@/db/schema";
import { householdContextFor } from "@/server/context";
import { getOverview } from "@/server/queries/overview";
import { zonedInstant } from "@/lib/time";
import { seedDemo } from "../../scripts/seed/seed";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const now = new Date("2026-10-03T08:00:00Z");
const TZ = "Europe/Paris";

type Demo = Awaited<ReturnType<typeof seedDemo>> & {
  ctx: Awaited<ReturnType<typeof householdContextFor>>;
};
let seeded: Demo;
const demo = async () => seeded;

const kwhOf = async (householdId: string, metric: string, from: string, to: string) => {
  const [row] = await db
    .select({ kwh: sql<number>`sum(${energyInterval.kwh})`.mapWith(Number) })
    .from(energyInterval)
    .where(
      and(
        eq(energyInterval.householdId, householdId),
        eq(energyInterval.metric, metric),
        gte(energyInterval.start, zonedInstant(from, 0, TZ)),
        lt(energyInterval.start, zonedInstant(to, 0, TZ)),
      ),
    );
  return row?.kwh ?? 0;
};

describe("vue d'ensemble sur le foyer de démo", () => {
  // 430 jours horaires : septembre 2025 sert de comparaison N-1.
  beforeAll(async () => {
    const r = await seedDemo({
      email: "overview-test@wattsup.test",
      password: "motdepasse-de-test",
      days: 430,
      now,
    });
    seeded = { ...r, ctx: await householdContextFor(r.userId) };
  }, 120_000);

  it("mois : budget = coût du mois des barres ; bilan et postes issus des données", async () => {
    const { ctx, householdId } = await demo();
    const o = await getOverview(ctx, "2026-09", now);
    if (o.status !== "ok") throw new Error(o.status);
    expect(o.period).toMatchObject({ from: "2026-09-01", to: "2026-10-01" });
    expect(o.nav).toEqual({ prev: "2026-08", next: "2026-10" });

    const sept = o.months.find((m) => m.key === "2026-09");
    expect(o.budget.totalCents).toBe((sept?.energyCents ?? 0) + (sept?.subscriptionCents ?? 0));
    expect(o.budget.totalCents).toBeGreaterThan(0);
    // Septembre 2025 est dans les données de démo : la comparaison N-1 est disponible.
    expect(o.budget.previousCents).toBeGreaterThan(0);

    const grid = await kwhOf(householdId, "grid_import", "2026-09-01", "2026-10-01");
    expect(sept?.kwh).toBeCloseTo(grid, 3);
    // N-1 : septembre 2025 entier, chiffré avec le contrat de l'époque.
    const gridSept2025 = await kwhOf(householdId, "grid_import", "2025-09-01", "2025-10-01");
    expect(sept?.previous?.kwh).toBeCloseTo(gridSept2025, 3);
    expect(sept?.previous?.energyCents).toBeGreaterThan(0);
    expect(o.budget.previousCents).toBe(
      (sept?.previous?.energyCents ?? 0) + (sept?.previous?.subscriptionCents ?? 0),
    );
    expect(o.batteryGaps).toEqual([]);
    expect(o.balance.gridImport).toBeCloseTo(grid, 3);
    expect(o.balance.consumption).toBeCloseTo(
      o.balance.origin.grid + o.balance.origin.solar + o.balance.origin.battery,
      6,
    );
    const water = await kwhOf(householdId, "category:eau-chaude", "2026-09-01", "2026-10-01");
    expect(o.categories.find((c) => c.name === "Eau chaude")?.kwh).toBeCloseTo(water, 3);

    expect(o.solar?.points).toHaveLength(30);
    expect(o.solar?.kwh).toBeGreaterThan(0);
    expect(o.solar?.yield).toBeGreaterThan(0);
    expect(o.solar?.previousYield).toBeGreaterThan(0);
  });

  it("année : budget = somme des mois (à l'arrondi près) ; mois futurs exclus", async () => {
    const { ctx } = await demo();
    const o = await getOverview(ctx, "2026", now);
    if (o.status !== "ok") throw new Error(o.status);
    expect(o.months.map((m) => m.key).at(-1)).toBe("2026-10");
    const sum = o.months.reduce((a, m) => a + m.energyCents + m.subscriptionCents, 0);
    expect(Math.abs((o.budget.totalCents ?? 0) - sum)).toBeLessThanOrEqual(o.months.length);
    expect(o.solar?.points).toHaveLength(10);
  });

  it("sans contrat souscrit ni actuel, l'électricité n'est pas chiffrée", async () => {
    const ctx = await createTestHousehold();
    await db.insert(energyInterval).values({
      householdId: ctx.householdId,
      metric: "grid_import",
      start: new Date("2026-10-01T10:00:00Z"),
      granularity: "hour",
      kwh: 1,
      source: "ha",
    });
    const o = await getOverview(ctx, undefined, now);
    if (o.status !== "ok") throw new Error(o.status);
    expect(o.budget.totalCents).toBeNull();
    expect(o.balance.gridImport).toBe(1);
  });

  it("batterie : signale les mois où la décharge arrive sans la charge", async () => {
    const base = await createTestHousehold();
    const ctx = { ...base, profile: { ...base.profile, battery: true } };
    const row = (metric: string, start: string, kwh: number) => ({
      householdId: ctx.householdId,
      metric,
      start: new Date(start),
      granularity: "hour" as const,
      kwh,
      source: "ha" as const,
    });
    await db
      .insert(energyInterval)
      .values([
        row("grid_import", "2026-02-10T10:00:00Z", 1),
        row("battery_discharge", "2026-02-10T19:00:00Z", 3),
        row("battery_charge", "2026-03-10T12:00:00Z", 4),
        row("battery_discharge", "2026-03-10T19:00:00Z", 3),
      ]);
    const o = await getOverview(ctx, "2026", now);
    if (o.status !== "ok") throw new Error(o.status);
    expect(o.batteryGaps).toEqual([{ missing: "charge", months: ["2026-02"] }]);
  });

  it("aucune donnée : no-data", async () => {
    const ctx = await createTestHousehold();
    expect(await getOverview(ctx, undefined, now)).toEqual({ status: "no-data" });
  });
});

describeTenantIsolation("vue d'ensemble", {
  setup: async (b) => {
    await db.insert(energyInterval).values({
      householdId: b.householdId,
      metric: "grid_import",
      start: new Date("2026-10-01T10:00:00Z"),
      granularity: "hour",
      kwh: 5,
      source: "ha",
    });
    return null;
  },
  attempt: async (a) => {
    const o = await getOverview(a, undefined, now);
    return o.status === "no-data" ? [] : [o];
  },
  expect: "empty",
});
