import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/summary/route";
import { db } from "@/db";
import { user } from "@/db/schema";
import { CONTRACT_PRESETS } from "@/domain/tariff/schema";
import { createContract } from "@/server/contracts";
import { householdContextFor } from "@/server/context";
import { addPurchase, addQuickConsumption } from "@/server/fuel";
import { ingest } from "@/server/ingest/persist";
import { createIngestToken, revokeIngestToken } from "@/server/ingest/token";
import { updateProfile } from "@/server/profile";
import { getSummary } from "@/server/summary";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const call = (token?: string) =>
  GET(
    new Request("http://localhost/api/v1/summary", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );

describe("GET /api/v1/summary", () => {
  it("chiffres du foyer avec un token valide", async () => {
    const base = await createTestHousehold("resume");
    await updateProfile(base, { ...base.profile, pellet: true });
    const ctx = await householdContextFor(base.userId);
    const preset = CONTRACT_PRESETS.find((p) => p.contract.kind === "base");
    if (!preset) throw new Error("préréglage Base manquant");
    await createContract(ctx, {
      ...preset,
      subscription: { startDate: "2024-01-01", endDate: null },
    });
    await addPurchase(ctx, {
      fuel: "pellet",
      qty: 20,
      unit: "bag",
      priceEur: null,
      date: "2024-01-01",
    });
    for (let d = 15; d >= 1; d--) {
      await addQuickConsumption(ctx, "pellet", new Date(Date.now() - d * 86_400_000));
    }
    const now = new Date();
    const hour = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
    await ingest(
      ctx.householdId,
      JSON.stringify({ version: 1, ts: hour(2), energy: { grid_import_kwh: 10 } }),
    );
    await ingest(
      ctx.householdId,
      JSON.stringify({ version: 1, ts: hour(1), energy: { grid_import_kwh: 11 } }),
    );
    const { token } = await createIngestToken(ctx);

    const res = await call(token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(1);
    expect(body.cost.month_eur).toBeGreaterThan(0);
    // 20 sacs achetés, 15 versés ces 21 derniers jours : 5 sacs, 15/21 sac par jour → 7 jours.
    expect(body.fuel.pellet).toEqual({ stock: 5, unit: "sacs", days_left: 7 });
    expect(body.alerts.map((a: { key: string }) => a.key)).toContain("fuel_stock:pellet");
  });

  it("sans token, token révoqué ou compte désactivé : 401", async () => {
    const ctx = await createTestHousehold("resume-refus");
    expect((await call()).status).toBe(401);
    const { token } = await createIngestToken(ctx);
    await db.update(user).set({ disabledAt: new Date() }).where(eq(user.id, ctx.userId));
    expect((await call(token)).status).toBe(401);
    await db.update(user).set({ disabledAt: null }).where(eq(user.id, ctx.userId));
    expect((await call(token)).status).toBe(200);
    await revokeIngestToken(ctx);
    expect((await call(token)).status).toBe(401);
  });
});

describeTenantIsolation("résumé pour Home Assistant", {
  setup: async (b) => {
    await updateProfile(b, { ...b.profile, pellet: true });
    const ctx = await householdContextFor(b.userId);
    await addPurchase(ctx, {
      fuel: "pellet",
      qty: 5,
      unit: "bag",
      priceEur: null,
      date: "2024-01-01",
    });
    return b;
  },
  attempt: async (a) => Object.keys((await getSummary(a)).fuel),
  expect: "empty",
});
