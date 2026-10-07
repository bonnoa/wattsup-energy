import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { ingestLog, pushSubscription } from "@/db/schema";
import { householdContextFor, type HouseholdContext } from "@/server/context";
import { ingest } from "@/server/ingest/persist";
import {
  deletePushSubscription,
  listPushDevices,
  pushAlerts,
  savePushSubscription,
  type PushSender,
} from "@/server/push";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const sub = (ctx: HouseholdContext, n = 1) => ({
  endpoint: `https://push.example.test/${ctx.householdId}/${n}`,
  p256dh: "cle-publique",
  auth: "secret",
});

/** Home Assistant muet depuis 9 h : une alerte de niveau 1. */
async function silentHousehold(now: Date): Promise<HouseholdContext> {
  const ctx = await createTestHousehold("push");
  const ts = new Date(now.getTime() - 9 * 3_600_000).toISOString();
  await ingest(ctx.householdId, JSON.stringify({ version: 1, ts, energy: { grid_import_kwh: 1 } }));
  // Reçu il y a 9 h (le journal date l'envoi à sa réception).
  await db
    .update(ingestLog)
    .set({ receivedAt: new Date(ts) })
    .where(eq(ingestLog.householdId, ctx.householdId));
  return householdContextFor(ctx.userId);
}

describe("notifications push", () => {
  it("appareil enregistré avec un nom lisible, puis retiré", async () => {
    const ctx = await createTestHousehold("push");
    await savePushSubscription(ctx, sub(ctx), ANDROID);
    expect((await listPushDevices(ctx)).map((d) => d.label)).toEqual(["Chrome sur Android"]);
    expect(await deletePushSubscription(ctx, sub(ctx).endpoint)).toBe(true);
    expect(await listPushDevices(ctx)).toEqual([]);
  });

  it("alerte poussée une fois sur chaque appareil ; abonnement expiré supprimé", async () => {
    const now = new Date();
    const ctx = await silentHousehold(now);
    await savePushSubscription(ctx, sub(ctx, 1), ANDROID);
    await savePushSubscription(ctx, sub(ctx, 2), ANDROID);
    const bodies: string[] = [];
    const send: PushSender = async (s, body) => {
      if (s.endpoint.endsWith("/2")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      bodies.push(body);
    };
    expect(await pushAlerts(ctx, { now, send })).toBe(1);
    expect(JSON.parse(bodies[0] ?? "{}")).toMatchObject({ title: "Home Assistant silencieux" });
    expect(
      await db.$count(pushSubscription, eq(pushSubscription.householdId, ctx.householdId)),
    ).toBe(1);
    expect(await pushAlerts(ctx, { now, send })).toBe(0);
  });

  it("aucun appareil : rien n'est noté comme envoyé", async () => {
    const now = new Date();
    const ctx = await silentHousehold(now);
    const send: PushSender = async () => {};
    expect(await pushAlerts(ctx, { now, send })).toBe(0);
    await savePushSubscription(ctx, sub(ctx), ANDROID);
    expect(await pushAlerts(ctx, { now, send })).toBe(1);
  });
});

describeTenantIsolation("push : retirer l'appareil d'un autre foyer", {
  setup: async (b) => {
    await savePushSubscription(b, sub(b), ANDROID);
    return b;
  },
  attempt: (a, b) => deletePushSubscription(a, sub(b).endpoint).then((ok) => (ok ? [ok] : [])),
  expect: "empty",
  untouched: async (b) => expect(await listPushDevices(b)).toHaveLength(1),
});

describeTenantIsolation("push : liste des appareils", {
  setup: async (b) => {
    await savePushSubscription(b, sub(b), ANDROID);
    return b;
  },
  attempt: (a) => listPushDevices(a),
  expect: "empty",
});
