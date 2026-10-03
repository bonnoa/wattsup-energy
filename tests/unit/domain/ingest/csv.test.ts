import { describe, expect, it } from "vitest";
import { CSV_LIMITS, csvRowKey, isCsvHeader, parseCsvLine } from "@/domain/ingest/csv";

const hourly = { timezone: "Europe/Paris", granularity: "hourly" as const, slugs: ["eau-chaude"] };
const daily = { ...hourly, granularity: "daily" as const };

describe("parseCsvLine — lignes horaires", () => {
  it("horodatage avec décalage : début d'heure UTC", () => {
    expect(parseCsvLine("2024-01-01T00:00:00+01:00,grid_import,0.412", hourly)).toEqual({
      ok: true,
      row: {
        metric: "grid_import",
        start: new Date("2023-12-31T23:00:00Z"),
        granularity: "hour",
        tariffSlot: "all",
        kwh: 0.412,
      },
    });
  });

  it("sans décalage : heure locale du foyer ; poste connu accepté", () => {
    const r = parseCsvLine("2024-07-01T10:00,category:eau-chaude,1.5", hourly);
    expect(r).toMatchObject({
      ok: true,
      row: { metric: "category:eau-chaude", start: new Date("2024-07-01T08:00:00Z") },
    });
  });

  it("motifs de rejet en français", () => {
    const error = (line: string, ctx = hourly) => {
      const r = parseCsvLine(line, ctx);
      return r.ok ? null : r.error;
    };
    expect(error("2024-01-01T00:00:00+01:00,grid_import")).toBe(
      "3 ou 4 colonnes attendues : timestamp,metric,kwh[,tariff_slot]",
    );
    expect(error("hier,grid_import,1")).toBe("horodatage ISO 8601 invalide");
    expect(error("2024-01-01T00:30:00+01:00,grid_import,1")).toBe(
      "une ligne horaire commence à une heure pile",
    );
    expect(error("2024-01-01T00:00:00Z,gaz,1")).toBe("métrique inconnue « gaz »");
    expect(error("2024-01-01T00:00:00Z,category:piscine,1")).toBe(
      "poste inconnu « piscine » : créez-le dans Réglages",
    );
    expect(error("2024-01-01T00:00:00Z,grid_import,-1")).toBe(
      "kWh positif attendu (point décimal)",
    );
    expect(error("2024-01-01T00:00:00Z,grid_import,1,5")).toBe(
      "kWh positif attendu (point décimal)",
    );
    expect(error("2024-01-01T00:00:00Z,grid_import,1,hp")).toBe(
      "tariff_slot réservé aux lignes quotidiennes",
    );
    expect(error("2024-01-01,grid_import,6.8")).toBe(
      "ce foyer reçoit des données horaires : ligne quotidienne refusée",
    );
  });
});

describe("parseCsvLine — lignes quotidiennes", () => {
  it("date seule : jour local, créneau HP/HC facultatif pour l'import réseau", () => {
    expect(parseCsvLine("2024-01-01,grid_import,6.82,hp", daily)).toEqual({
      ok: true,
      row: {
        metric: "grid_import",
        start: new Date("2023-12-31T23:00:00Z"),
        granularity: "day",
        tariffSlot: "hp",
        kwh: 6.82,
      },
    });
    expect(parseCsvLine("2024-01-01,solar_production,3", daily)).toMatchObject({
      ok: true,
      row: { tariffSlot: "all" },
    });
  });

  it("refus : créneau sur une autre métrique, créneau inconnu, ligne horaire", () => {
    expect(parseCsvLine("2024-01-01,solar_production,3,hc", daily)).toEqual({
      ok: false,
      error: "tariff_slot (hp ou hc) réservé à grid_import",
    });
    expect(parseCsvLine("2024-01-01,grid_import,3,tempo", daily)).toEqual({
      ok: false,
      error: "tariff_slot attendu : hp ou hc",
    });
    expect(parseCsvLine("2024-01-01T00:00:00Z,grid_import,3", daily)).toEqual({
      ok: false,
      error: "ce foyer reçoit des données quotidiennes : ligne horaire refusée",
    });
  });
});

describe("en-tête, clé et limites", () => {
  it("reconnaît l'en-tête, ignore espaces et retours chariot", () => {
    expect(isCsvHeader("timestamp,metric,kwh,tariff_slot\r")).toBe(true);
    expect(isCsvHeader("2024-01-01,grid_import,1")).toBe(false);
    expect(parseCsvLine(" 2024-01-01T00:00:00Z , grid_import , 1 \r", hourly).ok).toBe(true);
  });

  it("clé d'unicité d'un intervalle et limites documentées", () => {
    const r = parseCsvLine("2024-01-01T00:00:00Z,grid_import,1", hourly);
    if (!r.ok) throw new Error(r.error);
    expect(csvRowKey(r.row)).toBe("grid_import|2024-01-01T00:00:00.000Z|hour|all");
    expect(CSV_LIMITS).toEqual({ bytes: 20 * 1024 * 1024, lines: 500_000, batch: 5000 });
  });
});
