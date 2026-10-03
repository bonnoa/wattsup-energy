import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { category, energyInterval, ingestLog, meterState } from "@/db/schema";
import type { CategoryInput } from "@/domain/categories";
import {
  CategoryError,
  createCategory,
  deleteCategory,
  listCategories,
  unknownCategorySlugs,
  updateCategory,
} from "@/server/categories";
import type { HouseholdContext } from "@/server/context";
import { ingest } from "@/server/ingest/persist";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const water: CategoryInput = {
  name: "Eau chaude",
  slug: "eau-chaude",
  icon: "droplet",
  color: "grid",
  isHeating: false,
};
const NOW = new Date("2026-10-03T12:00:00Z");

async function addData(ctx: HouseholdContext, slug: string, start: string, kwh: number) {
  await db.insert(energyInterval).values({
    householdId: ctx.householdId,
    metric: `category:${slug}`,
    start: new Date(start),
    granularity: "hour",
    kwh,
    source: "ha",
  });
}

const metrics = async (ctx: HouseholdContext) =>
  (
    await db
      .select({ metric: energyInterval.metric })
      .from(energyInterval)
      .where(eq(energyInterval.householdId, ctx.householdId))
  ).map((r) => r.metric);

describe("postes de consommation", () => {
  it("création, liste avec les kWh des 30 derniers jours et la dernière donnée", async () => {
    const ctx = await createTestHousehold();
    await createCategory(ctx, water);
    await addData(ctx, "eau-chaude", "2026-10-02T10:00:00Z", 1.5);
    await addData(ctx, "eau-chaude", "2026-10-02T11:00:00Z", 0.5);
    await addData(ctx, "eau-chaude", "2026-08-01T11:00:00Z", 9); // hors 30 jours
    const [c] = await listCategories(ctx, NOW);
    expect(c).toMatchObject({ name: "Eau chaude", slug: "eau-chaude", isHeating: false });
    expect(c?.kwh30d).toBeCloseTo(2, 4);
    expect(c?.lastDataAt?.toISOString()).toBe("2026-10-02T11:00:00.000Z");
  });

  it("refuse un slug déjà utilisé", async () => {
    const ctx = await createTestHousehold();
    await createCategory(ctx, water);
    await expect(createCategory(ctx, { ...water, name: "Autre" })).rejects.toThrow(CategoryError);
  });

  it("changer le slug renomme les données et l'index du poste", async () => {
    const ctx = await createTestHousehold();
    const c = await createCategory(ctx, water);
    await addData(ctx, "eau-chaude", "2026-10-02T10:00:00Z", 1);
    await db.insert(meterState).values({
      householdId: ctx.householdId,
      metric: "category:eau-chaude",
      ts: new Date("2026-10-02T11:00:00Z"),
      value: 120,
    });
    await updateCategory(ctx, c?.id ?? "", { ...water, slug: "ballon" });
    expect(await metrics(ctx)).toEqual(["category:ballon"]);
    const [state] = await db
      .select()
      .from(meterState)
      .where(eq(meterState.householdId, ctx.householdId));
    expect(state?.metric).toBe("category:ballon");
  });

  it("supprimer le poste supprime ses données, pas celles des autres métriques", async () => {
    const ctx = await createTestHousehold();
    const c = await createCategory(ctx, water);
    await addData(ctx, "eau-chaude", "2026-10-02T10:00:00Z", 1);
    await db.insert(energyInterval).values({
      householdId: ctx.householdId,
      metric: "grid_import",
      start: new Date("2026-10-02T10:00:00Z"),
      granularity: "hour",
      kwh: 2,
      source: "ha",
    });
    expect(await deleteCategory(ctx, c?.id ?? "")).toBe(true);
    expect(await metrics(ctx)).toEqual(["grid_import"]);
  });

  it("un poste créé est reconnu à l'envoi suivant ; un inconnu reste signalé puis proposé", async () => {
    const ctx = await createTestHousehold();
    const body = (index: number, ts: string) =>
      JSON.stringify({
        version: 1,
        ts,
        energy: { grid_import_kwh: 100 + index },
        categories: { "eau-chaude": 50 + index, piscine: 4 + index },
      });
    const first = await ingest(ctx.householdId, body(0, "2026-10-03T08:00:00Z"));
    expect(first.body).toMatchObject({
      warnings: expect.arrayContaining([{ code: "unknown_category", key: "eau-chaude" }]),
    });
    expect(await unknownCategorySlugs(ctx)).toEqual(["eau-chaude", "piscine"]);

    await createCategory(ctx, water);
    const second = await ingest(ctx.householdId, body(1, "2026-10-03T09:00:00Z"));
    // Premier index du nouveau poste : point de départ des deltas, pas encore de kWh.
    expect(second.body).toMatchObject({
      warnings: [
        { code: "unknown_category", key: "piscine" },
        { code: "baseline", metric: "category:eau-chaude" },
      ],
    });
    expect(await unknownCategorySlugs(ctx)).toEqual(["piscine"]);
    expect(
      await db.$count(
        ingestLog,
        and(eq(ingestLog.householdId, ctx.householdId), eq(ingestLog.httpStatus, 200)),
      ),
    ).toBe(2);
  });
});

const ownedByB = async (b: HouseholdContext) => {
  const c = await createCategory(b, water);
  await addData(b, "eau-chaude", "2026-10-02T10:00:00Z", 1);
  return c?.id ?? "";
};
const untouched = async (b: HouseholdContext, id: string) => {
  const [row] = await db.select().from(category).where(eq(category.id, id));
  expect(row).toMatchObject({ name: "Eau chaude", slug: "eau-chaude" });
  expect(await metrics(b)).toEqual(["category:eau-chaude"]);
};

describeTenantIsolation("liste des postes", {
  setup: ownedByB,
  attempt: (a) => listCategories(a),
  expect: "empty",
});
describeTenantIsolation("modification d'un poste", {
  setup: ownedByB,
  attempt: (a, id) => updateCategory(a, id, { ...water, name: "piraté", slug: "pirate" }),
  expect: "empty",
  untouched,
});
describeTenantIsolation("suppression d'un poste", {
  setup: ownedByB,
  attempt: async (a, id) => ((await deleteCategory(a, id)) ? ["supprimé"] : []),
  expect: "empty",
  untouched,
});
describeTenantIsolation("slugs inconnus", {
  setup: async (b) => {
    await db.insert(ingestLog).values({
      householdId: b.householdId,
      httpStatus: 200,
      mode: "hourly",
      payloadSize: 10,
      warnings: [{ code: "unknown_category", key: "secret-de-b" }],
    });
    return null;
  },
  attempt: (a) => unknownCategorySlugs(a),
  expect: "empty",
});
