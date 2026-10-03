import { describe, expect, it } from "vitest";
import { dueSlots } from "@/server/scheduler";

const job = (name: string, at: string[]) => ({
  name,
  at,
  enabled: () => true,
  run: async () => "",
});
const jobs = [job("météo", ["07:00"]), job("tempo", ["11:30", "17:00"])];

describe("dueSlots", () => {
  it("rien avant 7 h (heure de Paris)", () => {
    expect(dueSlots(jobs, new Date("2026-10-03T04:59:00Z"), new Set())).toEqual([]); // 06:59
  });

  it("à 12 h : météo et Tempo de 11 h 30 sont dus, pas celui de 17 h", () => {
    const due = dueSlots(jobs, new Date("2026-10-03T10:00:00Z"), new Set()); // 12:00
    expect(due.map((d) => d.key)).toEqual(["météo@2026-10-03@07:00", "tempo@2026-10-03@11:30"]);
  });

  it("un créneau déjà exécuté n'est pas relancé ; il revient le lendemain", () => {
    const done = new Set(["météo@2026-10-03@07:00"]);
    expect(dueSlots(jobs, new Date("2026-10-03T06:00:00Z"), done)).toEqual([]);
    expect(dueSlots(jobs, new Date("2026-10-04T06:00:00Z"), done).map((d) => d.key)).toEqual([
      "météo@2026-10-04@07:00",
    ]);
  });
});
