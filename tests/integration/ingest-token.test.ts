import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { ingestToken } from "@/db/schema";
import {
  createIngestToken,
  getActiveIngestToken,
  revokeIngestToken,
  verifyIngestToken,
} from "@/server/ingest/token";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

describe("tokens d'ingestion", () => {
  it("génère un token wu_ dont seul le hash est stocké", async () => {
    const ctx = await createTestHousehold();
    const { token, prefix } = await createIngestToken(ctx);
    expect(token).toMatch(/^wu_[0-9A-Za-z]{43}$/);
    expect(token.startsWith(prefix)).toBe(true);

    const rows = await db
      .select()
      .from(ingestToken)
      .where(eq(ingestToken.householdId, ctx.householdId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hash).not.toContain(token.slice(3));
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("vérifie un en-tête Bearer valide et met à jour last_used_at", async () => {
    const ctx = await createTestHousehold();
    const { token } = await createIngestToken(ctx);
    const auth = await verifyIngestToken(`Bearer ${token}`);
    expect(auth?.householdId).toBe(ctx.householdId);
    const active = await getActiveIngestToken(ctx);
    expect(active?.lastUsedAt).toBeInstanceOf(Date);
  });

  it.each([null, "", "Bearer", "Basic abc", "Bearer wu_inconnu", "wu_sans_bearer"])(
    "refuse l'en-tête %j",
    async (header) => {
      expect(await verifyIngestToken(header)).toBeNull();
    },
  );

  it("régénérer révoque l'ancien token", async () => {
    const ctx = await createTestHousehold();
    const first = await createIngestToken(ctx);
    const second = await createIngestToken(ctx);
    expect(await verifyIngestToken(`Bearer ${first.token}`)).toBeNull();
    expect((await verifyIngestToken(`Bearer ${second.token}`))?.householdId).toBe(ctx.householdId);
    expect((await getActiveIngestToken(ctx))?.prefix).toBe(second.prefix);
  });

  it("révoquer désactive le token", async () => {
    const ctx = await createTestHousehold();
    const { token } = await createIngestToken(ctx);
    await revokeIngestToken(ctx);
    expect(await verifyIngestToken(`Bearer ${token}`)).toBeNull();
    expect(await getActiveIngestToken(ctx)).toBeNull();
  });
});

describeTenantIsolation("lecture du token actif", {
  setup: async (b) => createIngestToken(b),
  attempt: (a) => getActiveIngestToken(a),
  expect: "empty",
});

describeTenantIsolation("révocation du token", {
  setup: async (b) => createIngestToken(b),
  attempt: async (a) => {
    await revokeIngestToken(a);
    return [];
  },
  untouched: async (b, created) => {
    expect((await verifyIngestToken(`Bearer ${created.token}`))?.householdId).toBe(b.householdId);
  },
});
