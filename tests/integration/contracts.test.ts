import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { contract, contractPeriod, user } from "@/db/schema";
import { CONTRACT_PRESETS } from "@/domain/tariff/schema";
import type { Contract } from "@/domain/tariff/types";
import {
  addPricePeriod,
  ContractError,
  createContract,
  deleteContract,
  deletePricePeriod,
  duplicateContract,
  getContract,
  listContracts,
  switchContract,
  updateContract,
  updatePricePeriod,
} from "@/server/contracts";
import type { HouseholdContext } from "@/server/context";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const preset = (kind: Contract["kind"]) => {
  const p = CONTRACT_PRESETS.find((x) => x.contract.kind === kind);
  if (!p) throw new Error(kind);
  return p;
};
const hphc = preset("hphc");
const tempo = preset("tempo");
const base = preset("base");

const subscribed = (ctx: HouseholdContext, startDate: string, endDate: string | null = null) =>
  createContract(ctx, { ...hphc, subscription: { startDate, endDate } });

describe("contrats souscrits et simulés", () => {
  it("un contrat souscrit a une grille datée de son début ; un simulé, du jour", async () => {
    const ctx = await createTestHousehold();
    const s = await subscribed(ctx, "2024-10-01");
    const o = await createContract(ctx, { ...tempo, subscription: null });
    const list = await listContracts(ctx);
    expect(list.map((c) => [c.name, c.status, c.startDate])).toEqual([
      [hphc.name, "subscribed", "2024-10-01"],
      [tempo.name, "simulated", null],
    ]);
    expect(list[0]?.periods.map((p) => p.validFrom)).toEqual(["2024-10-01"]);
    expect(s?.id).toBeTruthy();
    expect(o?.status).toBe("simulated");
  });

  it("refuse deux contrats souscrits qui se chevauchent (rien n'est écrit)", async () => {
    const ctx = await createTestHousehold();
    await subscribed(ctx, "2024-10-01");
    await expect(
      createContract(ctx, { ...base, subscription: { startDate: "2025-06-01", endDate: null } }),
    ).rejects.toThrow(ContractError);
    expect(await listContracts(ctx)).toHaveLength(1);
  });

  it("ordre : actuel, souscrits passés (récents d'abord), simulés", async () => {
    const ctx = await createTestHousehold();
    await createContract(ctx, { ...tempo, subscription: null });
    await createContract(ctx, {
      ...base,
      name: "Ancien",
      subscription: { startDate: "2022-01-01", endDate: "2023-12-31" },
    });
    await createContract(ctx, {
      ...base,
      name: "Moins ancien",
      subscription: { startDate: "2024-01-01", endDate: "2024-09-30" },
    });
    await subscribed(ctx, "2024-10-01");
    expect((await listContracts(ctx)).map((c) => c.name)).toEqual([
      hphc.name,
      "Moins ancien",
      "Ancien",
      tempo.name,
    ]);
  });
});

describe("historique de prix", () => {
  it("ajouter, modifier puis supprimer une grille ; jamais la dernière", async () => {
    const ctx = await createTestHousehold();
    const c = await subscribed(ctx, "2024-10-01");
    const id = c?.id ?? "";
    const raised = { ...hphc.contract, prices: { hp: 0.29, hc: 0.22 } } as Contract;
    const added = await addPricePeriod(ctx, id, { validFrom: "2026-02-01", contract: raised });
    expect((await getContract(ctx, id))?.periods.map((p) => p.validFrom)).toEqual([
      "2024-10-01",
      "2026-02-01",
    ]);

    await updatePricePeriod(ctx, added?.id ?? "", {
      validFrom: "2026-02-01",
      contract: { ...raised, subscriptionEurYear: 250 } as Contract,
    });
    expect((await getContract(ctx, id))?.periods[1]?.contract.subscriptionEurYear).toBe(250);

    expect(await deletePricePeriod(ctx, added?.id ?? "")).toBe(true);
    const last = (await getContract(ctx, id))?.periods[0]?.id ?? "";
    await expect(deletePricePeriod(ctx, last)).rejects.toThrow(/au moins une grille/);
  });

  it("le type d'un contrat ne change pas", async () => {
    const ctx = await createTestHousehold();
    const c = await subscribed(ctx, "2024-10-01");
    await expect(
      addPricePeriod(ctx, c?.id ?? "", { validFrom: "2026-02-01", contract: base.contract }),
    ).rejects.toThrow(/type/);
  });
});

describe("changement de contrat", () => {
  it("clôt l'actuel la veille et souscrit l'offre à la date", async () => {
    const ctx = await createTestHousehold();
    const old = await subscribed(ctx, "2024-10-01");
    const offer = await createContract(ctx, { ...tempo, subscription: null });
    expect(await switchContract(ctx, offer?.id ?? "", "2026-11-01")).toBe(true);
    const byId = Object.fromEntries((await listContracts(ctx)).map((c) => [c.id, c]));
    expect(byId[old?.id ?? ""]).toMatchObject({ status: "subscribed", endDate: "2026-10-31" });
    expect(byId[offer?.id ?? ""]).toMatchObject({
      status: "subscribed",
      startDate: "2026-11-01",
      endDate: null,
    });
  });

  it("refuse de « changer » vers un contrat déjà souscrit", async () => {
    const ctx = await createTestHousehold();
    const old = await subscribed(ctx, "2024-10-01");
    await expect(switchContract(ctx, old?.id ?? "", "2026-11-01")).rejects.toThrow(/déjà souscrit/);
  });

  it("dupliquer donne une offre simulée avec la grille actuelle", async () => {
    const ctx = await createTestHousehold();
    const c = await subscribed(ctx, "2024-10-01");
    await addPricePeriod(ctx, c?.id ?? "", {
      validFrom: "2026-02-01",
      contract: { ...hphc.contract, prices: { hp: 0.3, hc: 0.2 } } as Contract,
    });
    const copy = await duplicateContract(ctx, c?.id ?? "");
    const full = await getContract(ctx, copy?.id ?? "");
    expect(full).toMatchObject({ status: "simulated", name: `${hphc.name} (copie)` });
    expect(full?.periods.map((p) => p.contract)).toEqual([
      { ...hphc.contract, prices: { hp: 0.3, hc: 0.2 } },
    ]);
  });

  it("supprimer le contrat supprime ses grilles ; supprimer l'utilisateur supprime tout", async () => {
    const ctx = await createTestHousehold();
    const c = await subscribed(ctx, "2024-10-01");
    expect(await deleteContract(ctx, c?.id ?? "")).toBe(true);
    expect(await db.$count(contractPeriod, eq(contractPeriod.contractId, c?.id ?? ""))).toBe(0);
    await subscribed(ctx, "2024-10-01");
    await db.delete(user).where(eq(user.id, ctx.userId));
    expect(await db.$count(contract, eq(contract.householdId, ctx.householdId))).toBe(0);
  });
});

const ownedByB = async (b: HouseholdContext) => (await subscribed(b, "2024-10-01"))?.id ?? "";
const untouched = async (_b: unknown, id: string) => {
  const [row] = await db.select().from(contract).where(eq(contract.id, id));
  expect(row).toMatchObject({ name: hphc.name, status: "subscribed", endDate: null });
  expect(await db.$count(contractPeriod, eq(contractPeriod.contractId, id))).toBe(1);
};
const periodOf = async (id: string) =>
  (await db.select().from(contractPeriod).where(eq(contractPeriod.contractId, id)))[0]?.id ?? "";

describeTenantIsolation("lecture d'un contrat", {
  setup: ownedByB,
  attempt: (a, id) => getContract(a, id),
  expect: "empty",
});
describeTenantIsolation("liste des contrats", {
  setup: ownedByB,
  attempt: (a) => listContracts(a),
  expect: "empty",
});
describeTenantIsolation("modification d'un contrat", {
  setup: ownedByB,
  attempt: (a, id) => updateContract(a, id, { name: "piraté", subscription: null }),
  expect: "empty",
  untouched,
});
describeTenantIsolation("ajout d'une grille", {
  setup: ownedByB,
  attempt: (a, id) => addPricePeriod(a, id, { validFrom: "2026-02-01", contract: hphc.contract }),
  expect: "empty",
  untouched,
});
describeTenantIsolation("modification d'une grille", {
  setup: ownedByB,
  attempt: async (a, id) =>
    updatePricePeriod(a, await periodOf(id), { validFrom: "2020-01-01", contract: hphc.contract }),
  expect: "empty",
  untouched,
});
describeTenantIsolation("suppression d'une grille", {
  setup: ownedByB,
  attempt: async (a, id) => ((await deletePricePeriod(a, await periodOf(id))) ? ["supprimée"] : []),
  expect: "empty",
  untouched,
});
describeTenantIsolation("duplication d'un contrat", {
  setup: ownedByB,
  attempt: (a, id) => duplicateContract(a, id),
  expect: "empty",
  untouched,
});
describeTenantIsolation("suppression d'un contrat", {
  setup: ownedByB,
  attempt: async (a, id) => ((await deleteContract(a, id)) ? ["supprimé"] : []),
  expect: "empty",
  untouched,
});
describeTenantIsolation("changement de contrat", {
  setup: ownedByB,
  attempt: async (a, id) => ((await switchContract(a, id, "2026-11-01")) ? ["changé"] : []),
  expect: "empty",
  untouched,
});
