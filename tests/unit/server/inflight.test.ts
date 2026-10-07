import { describe, expect, it } from "vitest";
import { shareInFlight } from "@/server/inflight";

describe("shareInFlight", () => {
  it("deux demandes simultanées identiques partagent un seul calcul", async () => {
    let runs = 0;
    let release!: (v: number) => void;
    const compute = () => {
      runs += 1;
      return new Promise<number>((r) => (release = r));
    };
    const a = shareInFlight("k", compute);
    const b = shareInFlight("k", compute);
    release(42);
    expect(await Promise.all([a, b])).toEqual([42, 42]);
    expect(runs).toBe(1);
  });

  it("une fois terminé, le calcul suivant repart de zéro ; une autre clé ne partage rien", async () => {
    let runs = 0;
    const compute = async () => ++runs;
    expect(await shareInFlight("x", compute)).toBe(1);
    expect(await shareInFlight("x", compute)).toBe(2);
    expect(await Promise.all([shareInFlight("y", compute), shareInFlight("z", compute)])).toEqual([
      3, 4,
    ]);
  });

  it("un échec est transmis à tous et n'est pas gardé", async () => {
    let runs = 0;
    const failing = async () => {
      runs += 1;
      throw new Error("panne");
    };
    await expect(
      Promise.all([shareInFlight("e", failing), shareInFlight("e", failing)]),
    ).rejects.toThrow("panne");
    await expect(shareInFlight("e", failing)).rejects.toThrow("panne");
    expect(runs).toBe(2);
  });
});
