import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { category, contract, energyInterval, household } from "@/db/schema";
import { seedDemo } from "../../scripts/seed/seed";

const now = new Date("2026-10-03T08:00:00Z");
const opts = { email: "seed-test@wattsup.test", password: "motdepasse-de-test", days: 10, now };

describe("seedDemo", () => {
  it("crée le foyer de démo, ses postes et 10 jours d'intervalles horaires", async () => {
    const r = await seedDemo(opts);
    expect(r.from).toBe("2026-09-23");
    expect(r.to).toBe("2026-10-03");
    expect(r.hours).toBe(240);
    const [home] = await db.select().from(household).where(eq(household.id, r.householdId));
    expect(home?.location?.label).toBe("Nantes (Loire-Atlantique)");
    expect(home?.profile.solar).toBe(true);
    const cats = await db.select().from(category).where(eq(category.householdId, r.householdId));
    expect(cats.map((c) => c.slug).sort()).toEqual(["chauffage-electrique", "eau-chaude"]);
    const contracts = await db
      .select()
      .from(contract)
      .where(eq(contract.householdId, r.householdId));
    expect(contracts).toHaveLength(4);
    expect(contracts.filter((c) => c.isCurrent).map((c) => c.kind)).toEqual(["hphc"]);
    const imports = await db
      .select()
      .from(energyInterval)
      .where(eq(energyInterval.householdId, r.householdId));
    expect(imports.filter((i) => i.metric === "grid_import")).toHaveLength(240);
  });

  it("est idempotent : relancer donne le même nombre de lignes", async () => {
    const first = await seedDemo(opts);
    const second = await seedDemo(opts);
    expect(second.householdId).toBe(first.householdId);
    expect(second.intervals).toBe(first.intervals);
  });
});
