import { beforeAll, describe, expect, it } from "vitest";
import { householdContextFor, type HouseholdContext } from "@/server/context";
import { addPurchase, setStock } from "@/server/fuel";
import { getRefillForecast } from "@/server/queries/heating";
import { seedDemo } from "../../scripts/seed/seed";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

// Parcours PRD 2 : en fin d'hiver, l'utilisateur met à jour son stock (12 sacs) et
// consulte la prévision pour l'hiver prochain.
const endOfWinter = new Date("2026-04-25T09:00:00Z");
let ctx: HouseholdContext;

describe("prévision de réapprovisionnement sur le foyer de démo", () => {
  beforeAll(async () => {
    const r = await seedDemo({
      email: "forecast-test@wattsup.test",
      password: "motdepasse-de-test",
      days: 700,
      now: endOfWinter,
    });
    ctx = await householdContextFor(r.userId);
    await setStock(ctx, { fuel: "pellet", qty: 12, unit: "bag" }, endOfWinter);
  }, 120_000);

  it("hiver prochain : sacs à acheter (et palettes), coût au dernier prix, deux saisons de référence", async () => {
    const view = await getRefillForecast(ctx, endOfWinter);
    const pellet = view.fuels.find((f) => f.fuel === "pellet");
    expect(pellet?.nextLabel).toBe("2026–2027");
    expect(pellet?.stock).toBe(12 * 15);
    const next = pellet?.next.moyen;
    if (next?.status !== "ok") throw new Error("prévision attendue");
    expect(next.basis).toEqual({ seasons: ["2025–2026", "2024–2025"], weatherCorrected: true });
    // Au sac près, avec les palettes entières qui les couvrent.
    expect(next.order.bags).toBe(Math.ceil(next.toBuy / 15 - 1e-9));
    expect(next.order.pallets).toBe(Math.ceil((next.order.bags ?? 0) / 66));
    expect(next.costEur).toBeGreaterThan(0);
    const hard = pellet?.next.rigoureux;
    if (hard?.status !== "ok") throw new Error("prévision attendue");
    expect(hard.need).toBeCloseTo(next.need * 1.15, 6);
    // Fin de saison en cours : il reste quelques jours de chauffe.
    expect(pellet?.current?.moyen.status).toBe("ok");
  });

  it("hors saison : pas de « fin de saison », prévision de l'hiver suivant", async () => {
    const summer = new Date("2026-06-15T09:00:00Z");
    const view = await getRefillForecast(ctx, summer);
    const wood = view.fuels.find((f) => f.fuel === "wood");
    expect(wood?.current).toBeNull();
    expect(wood?.nextLabel).toBe("2026–2027");
    expect(wood?.next.moyen.status).toBe("ok");
  });
});

describe("foyer sans historique", () => {
  it("données insuffisantes, même avec un achat", async () => {
    const fresh = await createTestHousehold();
    await addPurchase(fresh, {
      fuel: "pellet",
      qty: 1,
      unit: "pallet",
      priceEur: 420,
      date: "2026-04-01",
    });
    const view = await getRefillForecast(
      { ...fresh, profile: { ...fresh.profile, pellet: true, wood: false } },
      endOfWinter,
    );
    expect(view.fuels.map((f) => [f.fuel, f.next.moyen.status])).toEqual([
      ["pellet", "insufficient"],
    ]);
  });
});

describeTenantIsolation("prévision de réapprovisionnement", {
  setup: async (b) => {
    await addPurchase(b, {
      fuel: "pellet",
      qty: 1,
      unit: "pallet",
      priceEur: 420,
      date: "2025-09-01",
    });
    return null;
  },
  attempt: async (a) => {
    const view = await getRefillForecast(
      { ...a, profile: { ...a.profile, pellet: true } },
      endOfWinter,
    );
    return view.fuels.filter((f) => f.stock > 0);
  },
  expect: "empty",
});
