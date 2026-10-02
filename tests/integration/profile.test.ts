import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { DEFAULT_PROFILE, household } from "@/db/schema";
import { updateProfile } from "@/server/profile";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const pelletOnly = { ...DEFAULT_PROFILE, pellet: true };

describe("updateProfile", () => {
  it("enregistre le profil du foyer", async () => {
    const ctx = await createTestHousehold();
    expect(await updateProfile(ctx, pelletOnly)).toEqual(pelletOnly);
    const [row] = await db.select().from(household).where(eq(household.id, ctx.householdId));
    expect(row?.profile).toEqual(pelletOnly);
  });
});

describeTenantIsolation("mise à jour du profil", {
  setup: async (b) => b.householdId,
  // A met à jour son propre profil : celui de B ne doit pas bouger.
  attempt: async (a) => {
    await updateProfile(a, pelletOnly);
    return [];
  },
  untouched: async (_b, id) => {
    const [row] = await db.select().from(household).where(eq(household.id, id));
    expect(row?.profile).toEqual(DEFAULT_PROFILE);
  },
});
