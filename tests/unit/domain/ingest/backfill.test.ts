import { describe, expect, it } from "vitest";
import { backfillRows, isBackfill, parseBackfill } from "@/domain/ingest/backfill";

const TZ = "Europe/Paris";
const window = { from: new Date("2016-01-01T00:00:00Z"), to: new Date("2026-10-06T10:00:00Z") };
const ctx = { timezone: TZ, granularity: "hourly" as const, slugs: ["chauffe-eau"], window };

const payload = (statistics: Record<string, { start: string; change: number | null }[]>) => ({
  version: 1,
  backfill: {
    metrics: {
      grid_import: "sensor.import",
      solar_production: "sensor.envoy",
      "category:chauffe-eau": "sensor.ballon",
    },
    statistics,
  },
});

describe("isBackfill / parseBackfill", () => {
  it("reconnaît un envoi d'historique ; refuse une forme invalide", () => {
    expect(isBackfill({ version: 1, backfill: {} })).toBe(true);
    expect(isBackfill({ version: 1, ts: "2026-10-06T10:00:00Z" })).toBe(false);
    expect(parseBackfill(payload({})).success).toBe(true);
    const bad = parseBackfill({ version: 1, backfill: { metrics: { inconnu: "sensor.x" } } });
    expect(bad.success).toBe(false);
  });
});

describe("backfillRows", () => {
  it("heures complètes en kWh ; capteur et compteur reliés par la correspondance", () => {
    const p = parseBackfill(
      payload({
        "sensor.import": [
          { start: "2026-10-04T08:00:00+00:00", change: 0.117 },
          { start: "2026-10-04T09:00:00+00:00", change: null },
        ],
        "sensor.envoy": [{ start: "2026-10-04T08:00:00+00:00", change: 1.085 }],
        "sensor.ballon": [{ start: "2026-10-04T08:00:00+00:00", change: 0.4 }],
      }),
    );
    if (!p.success) throw new Error("payload attendu valide");
    const r = backfillRows(p.data, ctx);
    expect(r.rows).toEqual([
      {
        metric: "grid_import",
        start: new Date("2026-10-04T08:00:00Z"),
        granularity: "hour",
        tariffSlot: "all",
        kwh: 0.117,
      },
      {
        metric: "solar_production",
        start: new Date("2026-10-04T08:00:00Z"),
        granularity: "hour",
        tariffSlot: "all",
        kwh: 1.085,
      },
      {
        metric: "category:chauffe-eau",
        start: new Date("2026-10-04T08:00:00Z"),
        granularity: "hour",
        tariffSlot: "all",
        kwh: 0.4,
      },
    ]);
    expect(r.rejected).toEqual({ implausible: 0, negative: 0, outOfRange: 0, unknownCategory: 0 });
  });

  it("rejette l'invraisemblable, le négatif, l'hors fenêtre (heure en cours comprise), le poste inconnu", () => {
    const p = parseBackfill({
      version: 1,
      backfill: {
        metrics: { battery_charge: "sensor.marstek", "category:piscine": "sensor.piscine" },
        statistics: {
          "sensor.marstek": [
            { start: "2026-06-10T08:00:00+00:00", change: 18223.6 },
            { start: "2026-06-10T09:00:00+00:00", change: -3 },
            { start: "2010-06-10T09:00:00+00:00", change: 1 },
            { start: "2026-10-06T10:00:00+00:00", change: 1 },
            { start: "2026-06-10T10:00:00+00:00", change: 2 },
          ],
          "sensor.piscine": [{ start: "2026-06-10T10:00:00+00:00", change: 2 }],
        },
      },
    });
    if (!p.success) throw new Error("payload attendu valide");
    const r = backfillRows(p.data, ctx);
    expect(r.rows.map((x) => x.kwh)).toEqual([2]);
    expect(r.rejected).toEqual({ implausible: 1, negative: 1, outOfRange: 2, unknownCategory: 1 });
  });

  it("foyer quotidien : heures additionnées par jour local, jour en cours exclu", () => {
    const p = parseBackfill(
      payload({
        "sensor.import": [
          { start: "2026-10-03T21:00:00+00:00", change: 1 }, // 23 h le 3 (Paris)
          { start: "2026-10-03T22:00:00+00:00", change: 2 }, // 0 h le 4
          { start: "2026-10-04T21:00:00+00:00", change: 3 }, // 23 h le 4
          { start: "2026-10-06T06:00:00+00:00", change: 4 }, // aujourd'hui : exclu
        ],
      }),
    );
    if (!p.success) throw new Error("payload attendu valide");
    const r = backfillRows(p.data, { ...ctx, granularity: "daily" });
    expect(r.rows).toEqual([
      {
        metric: "grid_import",
        start: new Date("2026-10-02T22:00:00Z"),
        granularity: "day",
        tariffSlot: "all",
        kwh: 1,
      },
      {
        metric: "grid_import",
        start: new Date("2026-10-03T22:00:00Z"),
        granularity: "day",
        tariffSlot: "all",
        kwh: 5,
      },
    ]);
    expect(r.rejected.outOfRange).toBe(1);
  });
});
