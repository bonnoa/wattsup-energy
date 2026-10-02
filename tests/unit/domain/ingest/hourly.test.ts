import { describe, expect, it } from "vitest";
import { indexToIntervals, type MeterReading } from "@/domain/ingest/hourly";

const at = (iso: string) => new Date(iso);
const reading = (iso: string, value: number, metric = "grid_import" as const): MeterReading => ({
  metric,
  ts: at(iso),
  value,
});
const sum = (xs: { kwh: number }[]) => xs.reduce((a, x) => a + x.kwh, 0);

describe("indexToIntervals", () => {
  it("premier index : aucun intervalle, sert de référence", () => {
    const r = indexToIntervals(undefined, reading("2026-10-02T12:00:00Z", 1000));
    expect(r.intervals).toEqual([]);
    expect(r.warnings).toEqual([{ code: "baseline", metric: "grid_import" }]);
  });

  it("delta simple sur une heure pleine : un intervalle commençant à l'index précédent", () => {
    const r = indexToIntervals(
      reading("2026-10-02T12:00:00Z", 1000),
      reading("2026-10-02T13:00:00Z", 1000.75),
    );
    expect(r.warnings).toEqual([]);
    expect(r.intervals).toHaveLength(1);
    expect(r.intervals[0]?.start.toISOString()).toBe("2026-10-02T12:00:00.000Z");
    expect(r.intervals[0]?.kwh).toBeCloseTo(0.75, 10);
  });

  it("push décalé (minute 5) : ventile au prorata entre deux heures", () => {
    const r = indexToIntervals(
      reading("2026-10-02T12:05:00Z", 100),
      reading("2026-10-02T13:05:00Z", 101.2),
    );
    expect(r.intervals.map((i) => i.start.toISOString())).toEqual([
      "2026-10-02T12:00:00.000Z",
      "2026-10-02T13:00:00.000Z",
    ]);
    expect(r.intervals[0]?.kwh).toBeCloseTo(1.1, 10); // 55 min sur 60
    expect(r.intervals[1]?.kwh).toBeCloseTo(0.1, 10); // 5 min sur 60
  });

  it("trou de moins de 24 h : répartit le delta au prorata sans perte", () => {
    const r = indexToIntervals(
      reading("2026-10-02T10:00:00Z", 50),
      reading("2026-10-02T15:00:00Z", 55.3),
    );
    expect(r.intervals).toHaveLength(5);
    expect(sum(r.intervals)).toBeCloseTo(5.3, 10);
    expect(r.intervals.every((i) => Math.abs(i.kwh - 1.06) < 1e-9)).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("la somme des intervalles égale exactement le delta (pas de dérive flottante)", () => {
    const r = indexToIntervals(
      reading("2026-10-02T00:07:00Z", 0),
      reading("2026-10-02T23:41:00Z", 17.3),
    );
    expect(sum(r.intervals)).toBe(17.3);
  });

  it("trou de plus de 24 h : aucun intervalle, avertissement", () => {
    const r = indexToIntervals(
      reading("2026-10-01T10:00:00Z", 50),
      reading("2026-10-02T10:00:01Z", 80),
    );
    expect(r.intervals).toEqual([]);
    expect(r.warnings).toEqual([{ code: "gap_too_long", metric: "grid_import", hours: 24 }]);
  });

  it("reset du compteur : la nouvelle valeur est le delta", () => {
    const r = indexToIntervals(
      reading("2026-10-02T12:00:00Z", 18234.5),
      reading("2026-10-02T13:00:00Z", 0.4),
    );
    expect(r.intervals[0]?.kwh).toBeCloseTo(0.4, 10);
    expect(r.warnings).toEqual([{ code: "reset", metric: "grid_import" }]);
  });

  it("index identique : intervalles à zéro (consommation nulle, heure couverte)", () => {
    const r = indexToIntervals(
      reading("2026-10-02T12:00:00Z", 10),
      reading("2026-10-02T13:00:00Z", 10),
    );
    expect(r.intervals).toEqual([
      { metric: "grid_import", start: at("2026-10-02T12:00:00Z"), kwh: 0 },
    ]);
  });

  it("index plus ancien ou identique dans le temps : ignoré", () => {
    const r = indexToIntervals(
      reading("2026-10-02T13:00:00Z", 10),
      reading("2026-10-02T13:00:00Z", 11),
    );
    expect(r.intervals).toEqual([]);
    expect(r.warnings).toEqual([{ code: "out_of_order", metric: "grid_import" }]);
  });

  it("valeur implausible : conservée mais signalée", () => {
    const r = indexToIntervals(
      reading("2026-10-02T12:00:00Z", 0),
      reading("2026-10-02T13:00:00Z", 45),
    );
    expect(r.intervals[0]?.kwh).toBe(45);
    expect(r.warnings).toEqual([{ code: "implausible", metric: "grid_import", kwhPerHour: 45 }]);
  });

  it("valeur non finie ou négative : rejetée", () => {
    const r = indexToIntervals(
      reading("2026-10-02T12:00:00Z", 0),
      reading("2026-10-02T13:00:00Z", -3),
    );
    expect(r.intervals).toEqual([]);
    expect(r.warnings).toEqual([{ code: "invalid_value", metric: "grid_import" }]);
  });

  describe("changements d'heure (Europe/Paris) : les seaux sont des heures UTC", () => {
    it("passage à l'heure d'hiver : l'heure locale 02:00 dupliquée donne deux intervalles distincts", () => {
      // 25 oct. 2026 : 03:00 CEST → 02:00 CET. 00:00Z = 02:00 CEST, 01:00Z = 02:00 CET.
      const r = indexToIntervals(
        reading("2026-10-25T00:00:00Z", 0),
        reading("2026-10-25T02:00:00Z", 2),
      );
      expect(r.intervals.map((i) => i.start.toISOString())).toEqual([
        "2026-10-25T00:00:00.000Z",
        "2026-10-25T01:00:00.000Z",
      ]);
      expect(sum(r.intervals)).toBe(2);
    });

    it("passage à l'heure d'été : l'heure locale manquante ne crée pas de trou", () => {
      // 29 mars 2026 : 02:00 CET → 03:00 CEST. 01:00Z = 03:00 CEST.
      const r = indexToIntervals(
        reading("2026-03-29T00:00:00Z", 0), // 01:00 CET
        reading("2026-03-29T02:00:00Z", 1.5), // 04:00 CEST
      );
      expect(r.intervals).toHaveLength(2);
      expect(sum(r.intervals)).toBe(1.5);
    });
  });

  it("le plafond de plausibilité dépend de la métrique", () => {
    const r = indexToIntervals(
      { metric: "solar_production", ts: at("2026-06-01T11:00:00Z"), value: 0 },
      { metric: "solar_production", ts: at("2026-06-01T12:00:00Z"), value: 25 },
    );
    expect(r.warnings).toEqual([]);
  });
});
