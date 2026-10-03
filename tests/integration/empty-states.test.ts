import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { energyInterval } from "@/db/schema";
import { createCategory, listCategories } from "@/server/categories";
import { getContractComparison } from "@/server/queries/contracts";
import { getOverview } from "@/server/queries/overview";
import { createTestHousehold } from "../helpers/tenancy";

// T21 : un foyer neuf ou presque vide ne produit aucune valeur non finie (NaN, Infinity)
// que l'interface afficherait telle quelle.

const now = new Date("2026-10-03T08:00:00Z");

/** Chemins des nombres non finis d'une structure (vide si tout est fini). */
function nonFinite(value: unknown, path = "$"): string[] {
  if (typeof value === "number") return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => nonFinite(v, `${path}[${i}]`));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.entries(value).flatMap(([k, v]) => nonFinite(v, `${path}.${k}`));
  }
  return [];
}

const water = {
  name: "Eau chaude",
  slug: "eau-chaude",
  icon: "droplet",
  color: "grid",
  isHeating: false,
} as const;

describe("foyer neuf", () => {
  it("aucune donnée : états vides partout, sans valeur non finie", async () => {
    const ctx = await createTestHousehold();
    await createCategory(ctx, water);
    expect(await getOverview(ctx, undefined, now)).toEqual({ status: "no-data" });
    expect(await getContractComparison(ctx, now)).toEqual({ status: "no-data" });
    const categories = await listCategories(ctx, now);
    expect(categories[0]).toMatchObject({ kwh30d: 0, lastDataAt: null });
    expect(nonFinite(categories)).toEqual([]);
  });

  it("premier envoi du jour : vue calculée, couverture inconnue, aucun NaN", async () => {
    const ctx = await createTestHousehold();
    await db.insert(energyInterval).values({
      householdId: ctx.householdId,
      metric: "grid_import",
      start: new Date("2026-10-01T06:00:00Z"),
      granularity: "hour",
      kwh: 0.4,
      source: "ha",
    });
    // Premier jour du mois : aucune journée terminée, donc pas de couverture.
    const o = await getOverview(ctx, undefined, new Date("2026-10-01T09:00:00Z"));
    expect(o.status).toBe("ok");
    if (o.status === "ok") expect(o.coverage).toBeNull();
    expect(nonFinite(await getOverview(ctx, undefined, now))).toEqual([]);
    expect(nonFinite(await getContractComparison(ctx, now))).toEqual([]);
  });

  it("solaire coché sans production ni commune : rendement nul plutôt que NaN", async () => {
    const ctx = await createTestHousehold();
    await createCategory(ctx, water);
    await db.insert(energyInterval).values(
      ["2026-10-01T10:00:00Z", "2026-10-02T10:00:00Z"].map((start) => ({
        householdId: ctx.householdId,
        metric: "grid_import",
        start: new Date(start),
        granularity: "hour" as const,
        kwh: 1,
        source: "ha" as const,
      })),
    );
    const o = await getOverview(
      { ...ctx, profile: { ...ctx.profile, solar: true } },
      undefined,
      now,
    );
    if (o.status !== "ok") throw new Error(o.status);
    expect(o.solar).toMatchObject({ kwh: 0, yield: null, previousYield: null, noLocation: true });
    expect(o.balance.selfConsumptionRate).toBeNull();
    // 2 heures reçues sur les 48 des deux jours terminés
    expect(o.coverage).toBeCloseTo(2 / 48, 6);
    expect(nonFinite(o)).toEqual([]);
  });
});
