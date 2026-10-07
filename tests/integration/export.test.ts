import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { energyInterval } from "@/db/schema";
import { importCsv } from "@/server/csv/import";
import { createContract } from "@/server/contracts";
import { energyCsvChunks, exportData } from "@/server/export";
import { ingest } from "@/server/ingest/persist";
import { createIngestToken } from "@/server/ingest/token";
import { CONTRACT_PRESETS } from "@/domain/tariff/schema";
import type { HouseholdContext } from "@/server/context";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const csvOf = async (ctx: HouseholdContext, batch?: number) => {
  let out = "";
  for await (const chunk of energyCsvChunks(ctx, batch)) out += chunk;
  return out;
};
const streamOf = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
const rowsOf = (householdId: string) =>
  db
    .select({
      start: energyInterval.start,
      metric: energyInterval.metric,
      granularity: energyInterval.granularity,
      tariffSlot: energyInterval.tariffSlot,
      kwh: energyInterval.kwh,
    })
    .from(energyInterval)
    .where(and(eq(energyInterval.householdId, householdId)))
    .orderBy(asc(energyInterval.start), asc(energyInterval.metric));

async function withEnergy(): Promise<HouseholdContext> {
  const ctx = await createTestHousehold("export");
  const push = (ts: string, imp: number, sol: number) =>
    ingest(
      ctx.householdId,
      JSON.stringify({
        version: 1,
        ts,
        energy: { grid_import_kwh: imp, solar_production_kwh: sol },
      }),
    );
  await push("2026-09-01T10:00:00Z", 100, 50);
  await push("2026-09-01T11:00:00Z", 100.412, 51.25);
  await push("2026-09-01T12:00:00Z", 101, 53);
  return ctx;
}

describe("export de mes données", () => {
  it("énergie : CSV réimportable à l'identique dans un autre foyer", async () => {
    const a = await withEnergy();
    const csv = await csvOf(a);
    expect(csv.split("\n")[0]).toBe("timestamp,metric,kwh,tariff_slot");
    // Le relevé de 11 h donne l'énergie de l'heure 10 h–11 h.
    expect(csv).toContain("2026-09-01T10:00:00Z,grid_import,0.412,");

    const b = await createTestHousehold("reimport");
    const report = await importCsv(b, streamOf(csv), undefined, {
      now: new Date("2026-10-01T00:00:00Z"),
    });
    expect(report.rejected).toBe(0);
    const strip = (rows: Awaited<ReturnType<typeof rowsOf>>) =>
      rows.map((r) => ({ ...r, start: r.start.toISOString() }));
    expect(strip(await rowsOf(b.householdId))).toEqual(strip(await rowsOf(a.householdId)));
  });

  it("par lots : même fichier quelle que soit la taille des lots", async () => {
    const a = await withEnergy();
    expect(await csvOf(a, 1)).toBe(await csvOf(a));
  });

  it("le reste en JSON, sans token ni hash", async () => {
    const a = await withEnergy();
    const preset = CONTRACT_PRESETS[0];
    if (!preset) throw new Error("préréglage manquant");
    await createContract(a, { ...preset, subscription: null });
    const { token } = await createIngestToken(a);
    const data = await exportData(a);
    expect(data.contracts[0]?.periods).toHaveLength(1);
    expect(data.household?.timezone).toBe("Europe/Paris");
    const text = JSON.stringify(data);
    expect(text).not.toContain(token);
    expect(text).not.toMatch(/hash|password|session/i);
  });
});

describeTenantIsolation("export de l'énergie", {
  setup: withEnergy,
  attempt: async (a) => {
    const lines = (await csvOf(a)).trim().split("\n").slice(1);
    return lines.filter(Boolean);
  },
  expect: "empty",
});

describeTenantIsolation("export du reste", {
  setup: async (b) => {
    const preset = CONTRACT_PRESETS[0];
    if (preset) await createContract(b, { ...preset, subscription: null });
    return b;
  },
  attempt: async (a) => (await exportData(a)).contracts,
  expect: "empty",
});
