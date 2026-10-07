import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { setTheme } from "@/server/preferences";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const themeOf = async (userId: string) =>
  (await db.select({ theme: user.theme }).from(user).where(eq(user.id, userId)))[0]?.theme;

describe("thème", () => {
  it("clair par défaut, puis celui choisi", async () => {
    const ctx = await createTestHousehold("theme");
    expect(await themeOf(ctx.userId)).toBe("light");
    await setTheme(ctx, "dark");
    expect(await themeOf(ctx.userId)).toBe("dark");
  });
});

describeTenantIsolation("thème", {
  setup: async (b) => b.userId,
  attempt: async (a) => {
    await setTheme(a, "dark");
    return null;
  },
  expect: "empty",
  untouched: async (_b, id) => expect(await themeOf(id)).toBe("light"),
});
