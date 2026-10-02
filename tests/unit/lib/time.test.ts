import { describe, expect, it } from "vitest";
import { addDays, daysInYear, eachDay, localParts, parseHm } from "@/lib/time";

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
