import { describe, expect, it } from "vitest";
import { priceIntervals } from "@/domain/tariff/engine";
import type {
  PriceableInterval,
  PricingContext,
  TempoColor,
  TempoContract,
} from "@/domain/tariff/types";

// Montants attendus calculés à la main, indépendamment du moteur.

const TZ = "Europe/Paris";
const HOUR = 3_600_000;

function hourly(fromIso: string, toIso: string, kwh = 1): PriceableInterval[] {
  const out: PriceableInterval[] = [];
  for (let t = Date.parse(fromIso); t < Date.parse(toIso); t += HOUR) {
    out.push({ granularity: "hour", start: new Date(t), kwh });
  }
  return out;
}

const tempo: TempoContract = {
  kind: "tempo",
  subscriptionEurYear: 230.04,
  prices: {
    bleu: { hc: 0.1288, hp: 0.1552 },
    blanc: { hc: 0.1447, hp: 0.1792 },
    rouge: { hc: 0.1518, hp: 0.6586 },
  },
};

const ctx = (colors: Record<string, TempoColor>, from: string, to: string): PricingContext => ({
  timezone: TZ,
  period: { from, to },
  tempoColor: (day) => colors[day],
});

describe("contrat Tempo", () => {
  it("frontière de 6 h : 0 h–6 h appartient à la couleur de la veille", () => {
    // Journée locale du 15 janv. 2026 (CET) : 14 janv. 23:00Z → 15 janv. 23:00Z
    const day = hourly("2026-01-14T23:00:00Z", "2026-01-15T23:00:00Z");
    const r = priceIntervals(
      day,
      tempo,
      ctx({ "2026-01-14": "rouge", "2026-01-15": "blanc" }, "2026-01-15", "2026-01-15"),
    );
    expect(r.bySlot).toEqual({
      rouge_hc: { kwh: 6, energyCents: Math.round(6 * 0.1518 * 100) },
      blanc_hp: { kwh: 16, energyCents: Math.round(16 * 0.1792 * 100) },
      blanc_hc: { kwh: 2, energyCents: Math.round(2 * 0.1447 * 100) },
    });
    expect(r.energyCents).toBe(Math.round((6 * 0.1518 + 16 * 0.1792 + 2 * 0.1447) * 100));
    expect(r.assumedTempoDays).toBe(0);
  });

  it("jour rouge en heures pleines : le prix fort s'applique", () => {
    // 15 janv. 2026, 10:00–11:00 local
    const r = priceIntervals(
      hourly("2026-01-15T09:00:00Z", "2026-01-15T10:00:00Z", 2),
      tempo,
      ctx({ "2026-01-15": "rouge" }, "2026-01-15", "2026-01-15"),
    );
    expect(r.bySlot).toEqual({ rouge_hp: { kwh: 2, energyCents: Math.round(2 * 0.6586 * 100) } });
  });

  it("couleur inconnue : bleu supposé, jours Tempo distincts comptés", () => {
    // 15 janv. 0 h → 16 janv. 0 h local : jours Tempo 14 (0–6 h) et 15 (6–24 h), tous inconnus
    const r = priceIntervals(
      hourly("2026-01-14T23:00:00Z", "2026-01-15T23:00:00Z"),
      tempo,
      ctx({}, "2026-01-15", "2026-01-15"),
    );
    expect(Object.keys(r.bySlot).sort()).toEqual(["bleu_hc", "bleu_hp"]);
    expect(r.bySlot.bleu_hc?.kwh).toBe(8);
    expect(r.assumedTempoDays).toBe(2);
  });

  it("sans fournisseur de couleurs : tout est supposé bleu", () => {
    const r = priceIntervals(hourly("2026-01-15T09:00:00Z", "2026-01-15T12:00:00Z"), tempo, {
      timezone: TZ,
      period: { from: "2026-01-15", to: "2026-01-15" },
    });
    expect(r.bySlot.bleu_hp?.kwh).toBe(3);
    expect(r.assumedTempoDays).toBe(1);
  });

  it("année entièrement bleue : équivaut à un HP/HC 22 h–6 h aux prix bleus", () => {
    const year = hourly("2025-12-31T23:00:00Z", "2026-12-31T23:00:00Z");
    const allBlue: Record<string, TempoColor> = new Proxy({}, { get: () => "bleu" });
    const r = priceIntervals(year, tempo, ctx(allBlue, "2026-01-01", "2027-01-01"));
    expect(r.bySlot.bleu_hc?.kwh).toBe(2920);
    expect(r.bySlot.bleu_hp?.kwh).toBe(5840);
    // 2 920 × 0,1288 + 5 840 × 0,1552 = 376,096 + 906,368 = 1 282,464 €
    expect(r.energyCents).toBe(128246);
    expect(r.subscriptionCents).toBe(23004);
    expect(r.assumedTempoDays).toBe(0);
  });

  it("jour du passage à l'heure d'hiver : 9 h creuses sur 25", () => {
    const day = hourly("2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z");
    const allBlue: Record<string, TempoColor> = new Proxy({}, { get: () => "bleu" });
    const r = priceIntervals(day, tempo, ctx(allBlue, "2026-10-25", "2026-10-25"));
    expect(r.bySlot.bleu_hc?.kwh).toBe(9);
    expect(r.bySlot.bleu_hp?.kwh).toBe(16);
  });
});

describe("Tempo en intervalles journaliers", () => {
  const daily = (slot: "hp" | "hc" | null, kwh: number): PriceableInterval => ({
    granularity: "day",
    date: "2026-01-15",
    slot,
    kwh,
  });

  it("créneaux HP/HC du jour × couleur du jour calendaire", () => {
    const r = priceIntervals(
      [daily("hp", 10), daily("hc", 6)],
      tempo,
      ctx({ "2026-01-15": "blanc" }, "2026-01-15", "2026-01-15"),
    );
    expect(r.bySlot).toEqual({
      blanc_hp: { kwh: 10, energyCents: Math.round(10 * 0.1792 * 100) },
      blanc_hc: { kwh: 6, energyCents: Math.round(6 * 0.1447 * 100) },
    });
    expect(r.approximatedKwh).toBe(0);
  });

  it("total sans créneau : réparti 8 h creuses / 16 h pleines, signalé", () => {
    const r = priceIntervals(
      [daily(null, 24)],
      tempo,
      ctx({ "2026-01-15": "rouge" }, "2026-01-15", "2026-01-15"),
    );
    expect(r.bySlot.rouge_hc?.kwh).toBeCloseTo(8, 10);
    expect(r.bySlot.rouge_hp?.kwh).toBeCloseTo(16, 10);
    expect(r.approximatedKwh).toBe(24);
  });
});
