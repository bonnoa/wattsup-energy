import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { contract, user } from "@/db/schema";
import { CONTRACT_PRESETS } from "@/domain/tariff/schema";
import {
  createContract,
  deleteContract,
  duplicateContract,
  getContract,
  listContracts,
  setCurrentContract,
  updateContract,
} from "@/server/contracts";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const [base, hphc, tempo] = CONTRACT_PRESETS as [
  (typeof CONTRACT_PRESETS)[number],
  (typeof CONTRACT_PRESETS)[number],
  (typeof CONTRACT_PRESETS)[number],
];

describe("contrats du foyer", () => {
  it("le premier contrat créé devient le contrat actuel, pas les suivants", async () => {
    const ctx = await createTestHousehold();
    const first = await createContract(ctx, hphc);
    const second = await createContract(ctx, tempo);
    expect(first?.isCurrent).toBe(true);
    expect(second?.isCurrent).toBe(false);
    expect((await listContracts(ctx)).map((c) => c.name)[0]).toBe(hphc.name);
  });

  it("un seul contrat actuel à la fois", async () => {
    const ctx = await createTestHousehold();
    await createContract(ctx, hphc);
    const t = await createContract(ctx, tempo);
    expect(await setCurrentContract(ctx, t?.id ?? "")).toBe(true);
    const current = (await listContracts(ctx)).filter((c) => c.isCurrent);
    expect(current.map((c) => c.name)).toEqual([tempo.name]);
  });

  it("modifier, dupliquer, supprimer", async () => {
    const ctx = await createTestHousehold();
    const c = await createContract(ctx, base);
    const id = c?.id ?? "";
    const updated = await updateContract(ctx, id, { ...base, name: "Base 2026" });
    expect(updated?.name).toBe("Base 2026");

    const copy = await duplicateContract(ctx, id);
    expect(copy).toMatchObject({ name: "Base 2026 (copie)", isCurrent: false, kind: "base" });
    expect(copy?.config).toEqual(base.contract);

    expect(await deleteContract(ctx, id)).toBe(true);
    expect(await getContract(ctx, id)).toBeNull();
    expect(await deleteContract(ctx, id)).toBe(false);
  });

  it("supprimer l'utilisateur supprime ses contrats (cascade)", async () => {
    const ctx = await createTestHousehold();
    await createContract(ctx, base);
    await db.delete(user).where(eq(user.id, ctx.userId));
    expect(await db.$count(contract, eq(contract.householdId, ctx.householdId))).toBe(0);
  });
});

const ownedByB = async (b: Awaited<ReturnType<typeof createTestHousehold>>) =>
  (await createContract(b, hphc))?.id ?? "";

const untouched = async (_b: unknown, id: string) => {
  const [row] = await db.select().from(contract).where(eq(contract.id, id));
  expect(row).toMatchObject({ name: hphc.name, isCurrent: true });
};

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
  attempt: (a, id) => updateContract(a, id, { ...base, name: "piraté" }),
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

describeTenantIsolation("contrat actuel", {
  setup: ownedByB,
  attempt: async (a, id) => ((await setCurrentContract(a, id)) ? ["changé"] : []),
  expect: "empty",
  untouched,
});
