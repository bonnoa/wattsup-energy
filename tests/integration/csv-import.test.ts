import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { energyInterval } from "@/db/schema";
import { createCategory } from "@/server/categories";
import type { HouseholdContext } from "@/server/context";
import { importCsv } from "@/server/csv/import";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

/** Flux d'octets découpé en petits morceaux (lignes coupées en plein milieu). */
function streamOf(text: string, chunk = 977): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + chunk));
      offset += chunk;
    },
  });
}

const rows = (ctx: HouseholdContext, metric = "grid_import") =>
  db
    .select()
    .from(energyInterval)
    .where(and(eq(energyInterval.householdId, ctx.householdId), eq(energyInterval.metric, metric)));

describe("import CSV", () => {
  it("une année horaire (8 760 lignes) en moins de 10 s", async () => {
    const ctx = await createTestHousehold();
    const start = Date.parse("2024-01-01T00:00:00Z");
    const lines = ["timestamp,metric,kwh"];
    for (let h = 0; h < 8760; h++) {
      lines.push(`${new Date(start + h * 3_600_000).toISOString()},grid_import,0.5`);
    }
    const t0 = performance.now();
    const report = await importCsv(ctx, streamOf(lines.join("\r\n")));
    expect(performance.now() - t0).toBeLessThan(10_000);
    expect(report).toMatchObject({ lines: 8760, imported: 8760, rejected: 0, stopped: null });
    const stored = await rows(ctx);
    expect(stored).toHaveLength(8760);
    expect(stored.every((r) => r.source === "csv")).toBe(true);
  }, 20_000);

  it("lignes invalides comptées avec leur numéro et leur motif, sans bloquer le reste", async () => {
    const ctx = await createTestHousehold();
    await createCategory(ctx, {
      name: "Eau chaude",
      slug: "eau-chaude",
      icon: "droplet",
      color: "grid",
      isHeating: false,
    });
    const csv = [
      "timestamp,metric,kwh,tariff_slot",
      "2024-01-01T00:00:00Z,grid_import,0.4",
      "2024-01-01T01:00:00Z,gaz,1",
      "",
      "2024-01-01T02:00:00Z,category:eau-chaude,1,5",
      "2024-01-01T02:00:00Z,category:eau-chaude,1.5",
    ].join("\n");
    const report = await importCsv(ctx, streamOf(csv, 7));
    expect(report).toMatchObject({ lines: 4, imported: 2, rejected: 2 });
    expect(report.errors).toEqual([
      { line: 3, content: "2024-01-01T01:00:00Z,gaz,1", message: "métrique inconnue « gaz »" },
      {
        line: 5,
        content: "2024-01-01T02:00:00Z,category:eau-chaude,1,5",
        message: "kWh positif attendu (point décimal)",
      },
    ]);
  });

  it("un doublon CSV est remplacé ; une donnée Home Assistant est conservée", async () => {
    const ctx = await createTestHousehold();
    await db.insert(energyInterval).values({
      householdId: ctx.householdId,
      metric: "grid_import",
      start: new Date("2024-01-01T00:00:00Z"),
      granularity: "hour",
      kwh: 0.9,
      source: "ha",
    });
    const first = await importCsv(
      ctx,
      streamOf("2024-01-01T00:00:00Z,grid_import,0.1\n2024-01-01T01:00:00Z,grid_import,0.2\n"),
    );
    expect(first).toMatchObject({ imported: 1, keptHa: 1 });
    const again = await importCsv(ctx, streamOf("2024-01-01T01:00:00Z,grid_import,0.3"));
    expect(again).toMatchObject({ imported: 1, keptHa: 0 });
    const byHour = Object.fromEntries(
      (await rows(ctx)).map((r) => [r.start.toISOString(), [r.kwh, r.source]]),
    );
    expect(byHour).toEqual({
      "2024-01-01T00:00:00.000Z": [0.9, "ha"],
      "2024-01-01T01:00:00.000Z": [0.3, "csv"],
    });
  });

  it("même intervalle deux fois dans un lot : la dernière valeur l'emporte", async () => {
    const ctx = await createTestHousehold();
    const report = await importCsv(
      ctx,
      streamOf("2024-01-01T00:00:00Z,grid_import,0.1\n2024-01-01T00:00:00Z,grid_import,0.7"),
    );
    expect(report).toMatchObject({ imported: 1, duplicates: 1 });
    expect((await rows(ctx))[0]?.kwh).toBe(0.7);
  });

  it("au-delà de 500 000 lignes, l'import s'arrête et le dit", async () => {
    const ctx = await createTestHousehold();
    const report = await importCsv(ctx, streamOf("x\n".repeat(500_001), 65_536));
    expect(report.lines).toBe(500_000);
    expect(report.rejected).toBe(500_000);
    expect(report.errors).toHaveLength(1000);
    expect(report.stopped).toBe("limite de 500 000 lignes atteinte : la suite n'est pas importée");
  }, 30_000);

  it("au-delà de 20 Mo, l'import s'arrête et le dit", async () => {
    const ctx = await createTestHousehold();
    const report = await importCsv(ctx, streamOf("x".repeat(21 * 1024 * 1024), 1 << 20));
    expect(report.stopped).toBe("fichier de plus de 20 Mo : la suite n'est pas importée");
  });
});

describeTenantIsolation("import CSV", {
  setup: async (b) => {
    await db.insert(energyInterval).values({
      householdId: b.householdId,
      metric: "grid_import",
      start: new Date("2024-01-01T00:00:00Z"),
      granularity: "hour",
      kwh: 0.9,
      source: "csv",
    });
    return null;
  },
  attempt: async (a) => {
    await importCsv(a, streamOf("2024-01-01T00:00:00Z,grid_import,5"));
    return [];
  },
  expect: "empty",
  untouched: async (b) => {
    expect((await rows(b)).map((r) => r.kwh)).toEqual([0.9]);
  },
});
