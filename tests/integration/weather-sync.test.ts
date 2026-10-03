import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { household, weatherDaily } from "@/db/schema";
import { cellOf, type Cell, type WeatherDay } from "@/domain/weather";
import { getLocationStatus, parseLocation, setLocation } from "@/server/location";
import type { WeatherSource } from "@/server/weather/open-meteo";
import {
  backfillCell,
  knownCells,
  syncRecentWeather,
  upsertWeatherDays,
} from "@/server/weather/sync";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

// Source factice : aucun appel réseau, appels enregistrés.

const day = (date: string, tMean: number): WeatherDay => ({
  date,
  tMin: tMean - 4,
  tMax: tMean + 4,
  tMean,
  sunshineS: 30_000,
  radiationMjM2: 12,
});

function fakeSource(opts: { failFor?: Cell } = {}) {
  const calls: { kind: string; cell: Cell; args: unknown[] }[] = [];
  const failing = (cell: Cell) =>
    opts.failFor && opts.failFor.latE2 === cell.latE2 && opts.failFor.lonE2 === cell.lonE2;
  const source: WeatherSource = {
    forecast: async (cell, pastDays) => {
      calls.push({ kind: "forecast", cell, args: [pastDays] });
      if (failing(cell)) throw new Error("panne");
      return [day("2026-10-01", 13), day("2026-10-02", 12)];
    },
    archive: async (cell, from, to) => {
      calls.push({ kind: "archive", cell, args: [from, to] });
      return [day("2026-09-30", 15), day("2026-10-01", 14)];
    },
    searchCommunes: async () => [],
  };
  return { source, calls };
}

const rowsFor = (cell: Cell) =>
  db
    .select()
    .from(weatherDaily)
    .where(and(eq(weatherDaily.latE2, cell.latE2), eq(weatherDaily.lonE2, cell.lonE2)))
    .orderBy(weatherDaily.date);

// Mailles uniques par test (la table est globale) : longitude dérivée d'un compteur.
let n = 0;
const uniqueLocation = () => {
  n += 1;
  return { label: `Commune ${n}`, lat: 10 + n / 100, lon: 20 + n / 100 };
};

describe("localisation du foyer", () => {
  it("parseLocation valide et arrondit à 0,01°", () => {
    expect(parseLocation({ label: " Vigneux ", lat: 47.32545, lon: -1.73732 })).toEqual({
      label: "Vigneux",
      lat: 47.33,
      lon: -1.74,
    });
    expect(parseLocation({ label: "", lat: 0, lon: 0 })).toBeNull();
    expect(parseLocation({ label: "X", lat: 95, lon: 0 })).toBeNull();
  });

  it("setLocation enregistre des coordonnées arrondies", async () => {
    const ctx = await createTestHousehold();
    await setLocation(ctx, { label: "Test", lat: 47.32545, lon: -1.73732 });
    const [row] = await db.select().from(household).where(eq(household.id, ctx.householdId));
    expect(row?.location).toEqual({ label: "Test", lat: 47.33, lon: -1.74 });
  });

  it("getLocationStatus : null sans commune, état de la météo sinon", async () => {
    const ctx = await createTestHousehold();
    expect(await getLocationStatus(ctx)).toBeNull();
    const loc = uniqueLocation();
    await setLocation(ctx, loc);
    await upsertWeatherDays(cellOf(loc), [day("2026-10-01", 12), day("2026-10-02", 11)], "archive");
    expect(await getLocationStatus(ctx)).toMatchObject({ lastDate: "2026-10-02", days: 2 });
  });
});

describe("synchronisation", () => {
  it("une seule requête par maille, même pour plusieurs foyers", async () => {
    const loc = uniqueLocation();
    await setLocation(await createTestHousehold(), loc);
    await setLocation(await createTestHousehold(), { ...loc, label: "Voisin" });
    const { source, calls } = fakeSource();
    await syncRecentWeather(source);
    const cell = cellOf(loc);
    expect(
      calls.filter((c) => c.cell.latE2 === cell.latE2 && c.cell.lonE2 === cell.lonE2),
    ).toHaveLength(1);
    expect(calls[0]?.args).toEqual([7]);
    expect(await rowsFor(cell)).toHaveLength(2);
  });

  it("la prévision ne remplace jamais une valeur d'archive", async () => {
    const loc = uniqueLocation();
    const cell = cellOf(loc);
    await upsertWeatherDays(cell, [day("2026-10-01", 14)], "archive");
    await upsertWeatherDays(cell, [day("2026-10-01", 99), day("2026-10-02", 12)], "forecast");
    const rows = await rowsFor(cell);
    expect(rows.map((r) => [r.date, r.tMean, r.source])).toEqual([
      ["2026-10-01", 14, "archive"],
      ["2026-10-02", 12, "forecast"],
    ]);
  });

  it("l'archive remplace une valeur de prévision", async () => {
    const cell = cellOf(uniqueLocation());
    await upsertWeatherDays(cell, [day("2026-10-01", 99)], "forecast");
    await upsertWeatherDays(cell, [day("2026-10-01", 14)], "archive");
    expect((await rowsFor(cell))[0]).toMatchObject({ tMean: 14, source: "archive" });
  });

  it("une maille en échec n'empêche pas les autres", async () => {
    const ok = uniqueLocation();
    const ko = uniqueLocation();
    await setLocation(await createTestHousehold(), ok);
    await setLocation(await createTestHousehold(), ko);
    const { source } = fakeSource({ failFor: cellOf(ko) });
    const report = await syncRecentWeather(source);
    expect(report.failed).toContainEqual(cellOf(ko));
    expect(await rowsFor(cellOf(ok))).toHaveLength(2);
    expect(await rowsFor(cellOf(ko))).toHaveLength(0);
  });

  it("backfill : 3 ans d'archive jusqu'à la veille, puis les jours récents", async () => {
    const cell = cellOf(uniqueLocation());
    const { source, calls } = fakeSource();
    await backfillCell(source, cell, new Date("2026-10-03T08:00:00Z"));
    expect(calls.map((c) => c.kind)).toEqual(["archive", "forecast"]);
    expect(calls[0]?.args).toEqual(["2023-10-03", "2026-10-02"]);
    // 30/09 et 01/10 en archive, 02/10 en prévision (01/10 garde l'archive)
    expect((await rowsFor(cell)).map((r) => [r.date, r.source])).toEqual([
      ["2026-09-30", "archive"],
      ["2026-10-01", "archive"],
      ["2026-10-02", "forecast"],
    ]);
  });

  it("la journée en cours (simple prévision) n'est pas enregistrée", async () => {
    const loc = uniqueLocation();
    await setLocation(await createTestHousehold(), loc);
    const { source } = fakeSource();
    await syncRecentWeather(source, new Date("2026-10-02T08:00:00Z"));
    expect((await rowsFor(cellOf(loc))).map((r) => r.date)).toEqual(["2026-10-01"]);
  });

  it("knownCells ignore les foyers sans commune", async () => {
    const before = (await knownCells()).length;
    await createTestHousehold();
    expect(await knownCells()).toHaveLength(before);
  });
});

describeTenantIsolation("commune du foyer", {
  setup: async (b) => {
    await setLocation(b, { label: "Chez B", lat: 45, lon: 5 });
    return b.householdId;
  },
  attempt: async (a) => {
    await setLocation(a, { label: "Chez A", lat: 44, lon: 4 });
    return (await getLocationStatus(a))?.location.label === "Chez B" ? ["fuite"] : [];
  },
  untouched: async (_b, id) => {
    const [row] = await db.select().from(household).where(eq(household.id, id));
    expect(row?.location?.label).toBe("Chez B");
  },
});
