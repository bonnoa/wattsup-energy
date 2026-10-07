import { describe, expect, it } from "vitest";
import {
  addDays,
  daysInYear,
  eachDay,
  localParts,
  parseHm,
  tempoDay,
  zonedInstant,
} from "@/lib/time";

const TZ = "Europe/Paris";

describe("localParts", () => {
  it("donne la date, l'heure et le jour de semaine locaux", () => {
    // 2 oct. 2026 12:00Z = 14:00 CEST, un vendredi
    expect(localParts(new Date("2026-10-02T12:00:00Z"), TZ)).toEqual({
      date: "2026-10-02",
      hour: 14,
      minute: 0,
      weekday: 5,
    });
  });

  it("minuit local est l'heure 0 et le dimanche vaut 7", () => {
    expect(localParts(new Date("2026-10-03T22:00:00Z"), TZ)).toEqual({
      date: "2026-10-04",
      hour: 0,
      minute: 0,
      weekday: 7,
    });
  });

  it("heure d'hiver : 00:00Z et 01:00Z sont tous deux 02:00 local le 25 oct.", () => {
    expect(localParts(new Date("2026-10-25T00:00:00Z"), TZ).hour).toBe(2);
    expect(localParts(new Date("2026-10-25T01:00:00Z"), TZ).hour).toBe(2);
  });
});

describe("localParts : identique à Intl, en cache par quart d'heure", () => {
  const reference = (instant: Date, timeZone: string) => {
    const parts: Record<string, string> = {};
    for (const p of new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(instant))
      parts[p.type] = p.value;
    const weekdays: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      weekday: weekdays[parts.weekday ?? ""] ?? 0,
    };
  };

  it("toutes les 7 minutes autour des changements d'heure, dans plusieurs fuseaux", () => {
    const zones = [
      "Europe/Paris",
      "America/New_York",
      "Australia/Lord_Howe", // changement d'heure d'une demi-heure
      "Asia/Kathmandu", // décalage de 5 h 45
      "Pacific/Chatham", // décalage de 12 h 45 avec heure d'été
      "UTC",
    ];
    const windows = [
      "2026-03-29T00:00:00Z",
      "2026-10-25T00:00:00Z",
      "2026-04-05T12:00:00Z",
      "2026-03-08T05:00:00Z",
      "2026-11-01T04:00:00Z",
      "2026-09-27T12:00:00Z",
    ];
    for (const zone of zones) {
      for (const start of windows) {
        const from = Date.parse(start) - 6 * 3_600_000;
        for (let t = from; t < from + 12 * 3_600_000; t += 7 * 60_000 + 13_000) {
          const instant = new Date(t);
          expect(localParts(instant, zone), `${zone} ${instant.toISOString()}`).toEqual(
            reference(instant, zone),
          );
        }
      }
    }
  });
});

describe("dates locales", () => {
  it("addDays traverse les mois et les années", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("eachDay est demi-ouvert [from, to)", () => {
    expect(eachDay("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });

  it("daysInYear gère les années bissextiles", () => {
    expect(daysInYear(2024)).toBe(366);
    expect(daysInYear(2026)).toBe(365);
  });

  it("parseHm convertit HH:MM en minutes, 24:00 accepté", () => {
    expect(parseHm("22:30")).toBe(1350);
    expect(parseHm("24:00")).toBe(1440);
    expect(() => parseHm("25:00")).toThrow();
  });
});

describe("zonedInstant", () => {
  it("minuit local à Paris en été et en hiver", () => {
    expect(zonedInstant("2026-07-01", 0, TZ).toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(zonedInstant("2026-01-15", 0, TZ).toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });

  it("jours de changement d'heure", () => {
    expect(zonedInstant("2026-03-29", 0, TZ).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(zonedInstant("2026-10-25", 0, TZ).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(zonedInstant("2026-10-25", 6, TZ).toISOString()).toBe("2026-10-25T05:00:00.000Z");
  });

  it("UTC est l'identité", () => {
    expect(zonedInstant("2026-10-02", 14, "UTC").toISOString()).toBe("2026-10-02T14:00:00.000Z");
  });
});

describe("tempoDay", () => {
  it("avant 6 h locales : jour Tempo de la veille", () => {
    expect(tempoDay(new Date("2026-10-02T03:00:00Z"), TZ)).toBe("2026-10-01"); // 05:00 local
    expect(tempoDay(new Date("2026-10-02T04:00:00Z"), TZ)).toBe("2026-10-02"); // 06:00 local
  });
});
