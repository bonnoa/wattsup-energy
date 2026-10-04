import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { household } from "@/db/schema";
import { householdContextFor } from "@/server/context";
import { setOnboarding } from "@/server/household";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

describe("parcours de bienvenue", () => {
  it("un foyer neuf commence à l'étape 0 ; l'étape et la fin sont mémorisées", async () => {
    const ctx = await createTestHousehold();
    expect(ctx.onboarding).toEqual({ step: 0, done: false });
    await setOnboarding(ctx, { step: 3, done: false });
    expect((await householdContextFor(ctx.userId)).onboarding).toEqual({ step: 3, done: false });
    await setOnboarding(ctx, { step: 3, done: true });
    expect((await householdContextFor(ctx.userId)).onboarding.done).toBe(true);
  });
});

describeTenantIsolation("parcours de bienvenue", {
  setup: async () => null,
  attempt: async (a) => {
    await setOnboarding(a, { step: 4, done: true });
    return [];
  },
  expect: "empty",
  untouched: async (b) => {
    const [row] = await db.select().from(household).where(eq(household.id, b.householdId));
    expect(row).toMatchObject({ onboardingStep: 0, onboardingDone: false });
  },
});
