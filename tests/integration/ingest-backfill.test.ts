import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/v1/ingest/route";
import { db } from "@/db";
import { energyInterval, ingestLog } from "@/db/schema";
import type { HouseholdContext } from "@/server/context";
import { updateGranularity } from "@/server/household";
import { getLastPushAt } from "@/server/ingest/status";
import { createIngestToken } from "@/server/ingest/token";
import { createTestHousehold } from "../helpers/tenancy";

// Envoi d'historique (SPEC §6.4) par le même endpoint que les envois ordinaires.

async function setup(granularity: "hourly" | "daily" = "hourly") {
  const ctx = await createTestHousehold("backfill");
  if (granularity === "daily") await updateGranularity(ctx, "daily");
  const { token } = await createIngestToken(ctx);
  const push = async (body: unknown) => {
    const res = await POST(
      new Request("http://localhost/api/v1/ingest", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  };
  return { ctx, push };
}

const intervals = (ctx: HouseholdContext, metric = "grid_import") =>
  db
    .select()
    .from(energyInterval)
    .where(and(eq(energyInterval.householdId, ctx.householdId), eq(energyInterval.metric, metric)))
    .orderBy(energyInterval.start, energyInterval.tariffSlot);

const history = (points: { start: string; change: number | null }[]) => ({
  version: 1,
  backfill: {
    metrics: { grid_import: "sensor.import" },
    statistics: { "sensor.import": points },
  },
});

describe("envoi d'historique", () => {
  it("ajoute les heures manquantes, garde l'existant, rejette l'invraisemblable", async () => {
    const { ctx, push } = await setup();
    await db.insert(energyInterval).values({
      householdId: ctx.householdId,
      metric: "grid_import",
      start: new Date("2026-03-10T09:00:00Z"),
      granularity: "hour",
      kwh: 0.9,
      source: "ha",
    });
    const res = await push(
      history([
        { start: "2026-03-10T08:00:00+00:00", change: 0.5 },
        { start: "2026-03-10T09:00:00+00:00", change: 0.1 }, // déjà là : conservé
        { start: "2026-03-10T10:00:00+00:00", change: 18223.6 }, // saut aberrant
        { start: "2026-03-10T11:00:00+00:00", change: null },
      ]),
    );
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      ok: true,
      inserted: 1,
      existing: 1,
      rejected: { implausible: 1, negative: 0, outOfRange: 0, unknownCategory: 0 },
      quotaReached: false,
    });
    expect((await intervals(ctx)).map((i) => [i.start.toISOString(), i.kwh])).toEqual([
      ["2026-03-10T08:00:00.000Z", 0.5],
      ["2026-03-10T09:00:00.000Z", 0.9],
    ]);
    // Journalisé en « historique », sans compter comme un envoi ordinaire.
    const [log] = await db
      .select()
      .from(ingestLog)
      .where(eq(ingestLog.householdId, ctx.householdId));
    expect(log?.mode).toBe("backfill");
    expect(await getLastPushAt(ctx)).toBeNull();
  });

  it("foyer quotidien : un jour déjà reçu en HP et HC n'est pas recompté", async () => {
    const { ctx, push } = await setup("daily");
    const day = new Date("2026-03-09T23:00:00Z"); // 10 mars, minuit à Paris
    await db.insert(energyInterval).values(
      (["hp", "hc"] as const).map((tariffSlot) => ({
        householdId: ctx.householdId,
        metric: "grid_import",
        start: day,
        granularity: "day" as const,
        tariffSlot,
        kwh: 3,
        source: "ha" as const,
      })),
    );
    const res = await push(
      history([
        { start: "2026-03-10T08:00:00+00:00", change: 0.5 }, // 10 mars : déjà là
        { start: "2026-03-11T08:00:00+00:00", change: 0.7 }, // 11 mars : ajouté
      ]),
    );
    expect(res.json).toMatchObject({ inserted: 1, existing: 1 });
    expect((await intervals(ctx)).map((i) => [i.start.toISOString(), i.tariffSlot, i.kwh])).toEqual(
      [
        ["2026-03-09T23:00:00.000Z", "hc", 3],
        ["2026-03-09T23:00:00.000Z", "hp", 3],
        ["2026-03-10T23:00:00.000Z", "all", 0.7],
      ],
    );
  });

  it("forme invalide : 400 détaillé, journalisé", async () => {
    const { push } = await setup();
    const res = await push({ version: 1, backfill: { metrics: { inconnu: "sensor.x" } } });
    expect(res.status).toBe(400);
    expect(res.json.ok).toBe(false);
  });
});
