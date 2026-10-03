import { describe, expect, it } from "vitest";
import { compareContracts, type ContractToCompare } from "@/domain/tariff/compare";
import { priceIntervals } from "@/domain/tariff/engine";
import { CONTRACT_PRESETS } from "@/domain/tariff/schema";
import type { PriceableInterval, PricingContext } from "@/domain/tariff/types";

const TZ = "Europe/Paris";
const ctx: PricingContext = { timezone: TZ, period: { from: "2026-01-01", to: "2026-01-31" } };

// 30 jours : 1 kWh par heure, plus 3 kWh la nuit (chauffe-eau en heures creuses).
const hourly: PriceableInterval[] = [];
for (
  let t = Date.parse("2025-12-31T23:00:00Z");
  t < Date.parse("2026-01-30T23:00:00Z");
  t += 3_600_000
) {
  const hourParis = (new Date(t).getUTCHours() + 1) % 24;
  hourly.push({
    granularity: "hour",
    start: new Date(t),
    kwh: hourParis >= 2 && hourParis < 5 ? 4 : 1,
  });
}

const contracts: ContractToCompare[] = CONTRACT_PRESETS.map((p, i) => ({
  id: `c${i}`,
  name: p.name,
  isCurrent: p.contract.kind === "hphc",
  contract: p.contract,
}));

describe("compareContracts", () => {
  const result = compareContracts(contracts, hourly, ctx, 30);

  it("trie du moins cher au plus cher et reprend les coûts du moteur", () => {
    const annual = result.map((r) => r.annualCents);
    expect(annual).toEqual([...annual].sort((a, b) => a - b));
    for (const r of result) {
      expect(r.totalCents).toBe(priceIntervals(hourly, r.contract, ctx).totalCents);
    }
  });

  it("annualise sur 365 jours et calcule l'écart avec le contrat actuel", () => {
    const current = result.find((r) => r.isCurrent);
    expect(current?.deltaAnnualCents).toBe(0);
    for (const r of result) {
      expect(r.annualCents).toBe(Math.round((r.totalCents * 365) / 30));
      expect(r.deltaAnnualCents).toBe(r.annualCents - (current?.annualCents ?? 0));
    }
  });

  it("sans couleurs Tempo connues, les jours supposés sont comptés", () => {
    expect(result.find((r) => r.contract.kind === "tempo")?.assumedTempoDays).toBe(31);
  });

  it("données horaires : aucun contrat n'est approximatif", () => {
    expect(result.every((r) => !r.approximate)).toBe(true);
  });

  it("sans contrat actuel : pas d'écart", () => {
    const none = compareContracts(
      contracts.map((c) => ({ ...c, isCurrent: false })),
      hourly,
      ctx,
      30,
    );
    expect(none.every((r) => r.deltaAnnualCents === null)).toBe(true);
  });
});

const at = (i: number) => {
  const c = contracts[i];
  if (!c) throw new Error(`contrat ${i} absent`);
  return c;
};

describe("données journalières", () => {
  const daily: PriceableInterval[] = [
    { granularity: "day", date: "2026-01-10", slot: "hp", kwh: 10 },
    { granularity: "day", date: "2026-01-10", slot: "hc", kwh: 6 },
  ];
  const twoHphc: ContractToCompare[] = [
    { ...at(1), isCurrent: true },
    {
      id: "autre",
      name: "HC 1 h – 7 h",
      isCurrent: false,
      contract: {
        kind: "hphc",
        subscriptionEurYear: 236.4,
        prices: { hp: 0.27, hc: 0.2 },
        hcRanges: [{ from: "01:00", to: "07:00" }],
      },
    },
    { ...at(0), isCurrent: false },
  ];

  it("HP/HC aux heures creuses différentes du contrat actuel : approximatif ; Base : exact", () => {
    const r = compareContracts(twoHphc, daily, ctx, 1);
    const byId = Object.fromEntries(r.map((c) => [c.id, c.approximate]));
    expect(byId).toEqual({ c1: false, autre: true, c0: false });
  });
});
