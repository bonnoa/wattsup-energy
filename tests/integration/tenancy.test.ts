import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { household } from "@/db/schema";
import { householdContextFor, type HouseholdContext } from "@/server/context";
import { checkIsolation, createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

// Opérations témoins, écrites selon la convention `operation(ctx, input)`.
const readHousehold = (ctx: HouseholdContext, id: string) =>
  db
    .select()
    .from(household)
    .where(and(eq(household.id, id), eq(household.ownerId, ctx.userId)));

const renameHousehold = (ctx: HouseholdContext, id: string, name: string) =>
  db
    .update(household)
    .set({ name })
    .where(and(eq(household.id, id), eq(household.ownerId, ctx.userId)))
    .returning();

describe("householdContextFor", () => {
  it("renvoie le foyer de l'utilisateur et ses réglages", async () => {
    const ctx = await createTestHousehold("ctx");
    const again = await householdContextFor(ctx.userId);
    expect(again.householdId).toBe(ctx.householdId);
    expect(again.timezone).toBe("Europe/Paris");
    expect(again.settings.pelletBagKg).toBe(15);
  });

  it("deux utilisateurs ont deux foyers distincts", async () => {
    const a = await createTestHousehold("a");
    const b = await createTestHousehold("b");
    expect(a.householdId).not.toBe(b.householdId);
  });
});

describeTenantIsolation("lecture du foyer", {
  setup: async (b) => b.householdId,
  attempt: (a, id) => readHousehold(a, id),
  expect: "empty",
});

describeTenantIsolation("modification du foyer", {
  setup: async (b) => b.householdId,
  attempt: (a, id) => renameHousehold(a, id, "piraté"),
  expect: "empty",
  untouched: async (_b, id) => {
    const [row] = await db.select().from(household).where(eq(household.id, id));
    expect(row?.name).toBe("Mon foyer");
  },
});

describe("le harnais détecte une fuite", () => {
  it("échoue si l'opération ignore le foyer", async () => {
    // Opération volontairement fautive : pas de filtre sur le propriétaire.
    const leaky = (_ctx: HouseholdContext, id: string) =>
      db.select().from(household).where(eq(household.id, id));
    await expect(
      checkIsolation({ setup: async (b) => b.householdId, attempt: leaky }),
    ).rejects.toThrow(/fuite/);
  });

  it("échoue si la ressource de B a été modifiée", async () => {
    const careless = (_ctx: HouseholdContext, id: string) =>
      db
        .update(household)
        .set({ name: "piraté" })
        .where(eq(household.id, id))
        .then(() => []);
    await expect(
      checkIsolation({
        setup: async (b) => b.householdId,
        attempt: careless,
        untouched: async (_b, id) => {
          const [row] = await db.select().from(household).where(eq(household.id, id));
          expect(row?.name).toBe("Mon foyer");
        },
      }),
    ).rejects.toThrow();
  });
});
