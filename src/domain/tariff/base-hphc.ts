import { parseHm } from "@/lib/time";
import type { BaseContract, HphcContract, Slot, TimeRange } from "./types";
import type { Pricer, Share } from "./pricer";

const DAY_MIN = 1440;

/** Plages normalisées en segments [début, fin) dans une journée, sans passage de minuit. */
export function toSegments(ranges: readonly TimeRange[]): [number, number][] {
  const segments: [number, number][] = [];
  for (const r of ranges) {
    const from = parseHm(r.from);
    const to = parseHm(r.to);
    if (from === to) throw new Error(`plage vide : ${r.from}–${r.to}`);
    if (from < to) segments.push([from, to]);
    else segments.push([from, DAY_MIN], [0, to]);
  }
  return segments;
}

/** Part (0–1) de [start, start + duration) couverte par les segments. */
export function coveredFraction(
  segments: readonly [number, number][],
  startMin: number,
  durationMin: number,
): number {
  const end = startMin + durationMin;
  let covered = 0;
  for (const [a, b] of segments) covered += Math.max(0, Math.min(end, b) - Math.max(startMin, a));
  return Math.min(1, covered / durationMin);
}

export function basePricer(contract: BaseContract): Pricer {
  const all: Share[] = [{ key: "base", price: contract.priceEurKwh, fraction: 1 }];
  return {
    hour: () => all,
    day: () => ({ shares: all, approximated: false }),
  };
}

export function hphcPricer(contract: HphcContract): Pricer {
  const segments = toSegments(contract.hcRanges);
  const split = (hc: number): Share[] =>
    [
      { key: "hc", price: contract.prices.hc, fraction: hc },
      { key: "hp", price: contract.prices.hp, fraction: 1 - hc },
    ].filter((s) => s.fraction > 0);
  const slotShare = (slot: Slot): Share[] => [
    { key: slot, price: contract.prices[slot], fraction: 1 },
  ];
  // Sans créneau, on suppose une consommation uniforme sur la journée.
  const hcShareOfDay = coveredFraction(segments, 0, DAY_MIN);

  return {
    hour: (local) => split(coveredFraction(segments, local.hour * 60 + local.minute, 60)),
    day: (_date, slot) =>
      slot
        ? { shares: slotShare(slot), approximated: false }
        : { shares: split(hcShareOfDay), approximated: true },
  };
}
