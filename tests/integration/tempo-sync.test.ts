import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { tempoCalendar, tempoOverride } from "@/db/schema";
import type { TempoDay } from "@/domain/tempo-calendar";
import type { TempoSource } from "@/server/tempo/community";
import { loadTempoSeed, syncTempo, tempoColorsFor } from "@/server/tempo/sync";
import { createTestHousehold } from "../helpers/tenancy";

// Calendrier global : chaque test repart d'une table vide.
beforeEach(async () => {
  await db.delete(tempoCalendar);
});

function fakeSource(bySeason: Record<string, TempoDay[] | Error>) {
  const calls: string[] = [];
  const source: TempoSource = {
    season: async (s) => {
      calls.push(s);
      const r = bySeason[s] ?? [];
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { source, calls };
}

const colorOf = async (date: string) =>
  (await db.select().from(tempoCalendar).where(eq(tempoCalendar.date, date)))[0];

describe("amorçage", () => {
  it("charge les 1 826 jours du seed, de façon idempotente", async () => {
    expect(await loadTempoSeed()).toBe(1826);
    await loadTempoSeed();
    expect(await db.$count(tempoCalendar)).toBe(1826);
    expect(await colorOf("2025-09-01")).toMatchObject({ source: "seed" });
  });

  it("le seed n'écrase pas une couleur récupérée en ligne", async () => {
    await db
      .insert(tempoCalendar)
      .values({ date: "2025-09-01", color: "rouge", source: "community" });
    await loadTempoSeed();
    expect(await colorOf("2025-09-01")).toMatchObject({ color: "rouge", source: "community" });
  });
});

describe("synchronisation", () => {
  const now = new Date("2026-10-03T10:00:00Z");

  it("sans donnée en ligne : saison en cours jusqu'au lendemain", async () => {
    const { source, calls } = fakeSource({
      "2026-2027": [
        { date: "2026-10-03", color: "bleu" },
        { date: "2026-10-04", color: "blanc" },
      ],
    });
    const r = await syncTempo(source, now);
    expect(calls).toEqual(["2026-2027"]);
    expect(r).toMatchObject({ days: 2, failed: [] });
    expect(await colorOf("2026-10-04")).toMatchObject({ color: "blanc", source: "community" });
  });

  it("rattrape depuis la dernière date connue, saison par saison", async () => {
    await db
      .insert(tempoCalendar)
      .values({ date: "2026-08-20", color: "bleu", source: "community" });
    const { source, calls } = fakeSource({});
    await syncTempo(source, now);
    expect(calls).toEqual(["2025-2026", "2026-2027"]);
  });

  it("la source en ligne remplace le seed", async () => {
    await db
      .insert(tempoCalendar)
      .values({ date: "2026-08-20", color: "bleu", source: "community" });
    await loadTempoSeed();
    const { source } = fakeSource({ "2025-2026": [{ date: "2026-01-15", color: "rouge" }] });
    await syncTempo(source, now);
    expect(await colorOf("2026-01-15")).toMatchObject({ color: "rouge", source: "community" });
  });

  it("une saison en échec n'arrête pas les suivantes", async () => {
    await db
      .insert(tempoCalendar)
      .values({ date: "2026-08-20", color: "bleu", source: "community" });
    const { source } = fakeSource({
      "2025-2026": new Error("panne"),
      "2026-2027": [{ date: "2026-10-04", color: "rouge" }],
    });
    const r = await syncTempo(source, now);
    expect(r.failed).toEqual(["2025-2026"]);
    expect(await colorOf("2026-10-04")).toMatchObject({ color: "rouge" });
  });
});

describe("tempoColorsFor", () => {
  it("la couleur du foyer prime sur le calendrier, uniquement pour ce foyer", async () => {
    await db.insert(tempoCalendar).values([
      { date: "2026-01-14", color: "bleu", source: "community" },
      { date: "2026-01-15", color: "blanc", source: "community" },
    ]);
    const a = await createTestHousehold("a");
    const b = await createTestHousehold("b");
    await db
      .insert(tempoOverride)
      .values({ householdId: a.householdId, date: "2026-01-15", color: "rouge", source: "manual" });

    const colorsA = await tempoColorsFor(a.householdId, "2026-01-14", "2026-01-15");
    const colorsB = await tempoColorsFor(b.householdId, "2026-01-14", "2026-01-15");
    expect(Object.fromEntries(colorsA)).toEqual({ "2026-01-14": "bleu", "2026-01-15": "rouge" });
    expect(Object.fromEntries(colorsB)).toEqual({ "2026-01-14": "bleu", "2026-01-15": "blanc" });
  });
});
