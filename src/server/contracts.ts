import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { contract } from "@/db/schema";
import type { ContractInput } from "@/domain/tariff/schema";
import type { HouseholdContext } from "./context";

// Contrats du foyer (T17). Toutes les opérations filtrent par ctx.householdId ; un id
// d'un autre foyer se comporte comme un id inconnu.

export type ContractRow = typeof contract.$inferSelect;

const own = (ctx: HouseholdContext, id: string) =>
  and(eq(contract.id, id), eq(contract.householdId, ctx.householdId));

/** Contrats du foyer : l'actuel d'abord, puis du plus récent au plus ancien. */
export function listContracts(ctx: HouseholdContext): Promise<ContractRow[]> {
  return db
    .select()
    .from(contract)
    .where(eq(contract.householdId, ctx.householdId))
    .orderBy(desc(contract.isCurrent), desc(contract.createdAt), asc(contract.name));
}

export async function getContract(ctx: HouseholdContext, id: string): Promise<ContractRow | null> {
  const [row] = await db.select().from(contract).where(own(ctx, id));
  return row ?? null;
}

/** Crée un contrat ; le premier du foyer devient le contrat actuel. */
export async function createContract(ctx: HouseholdContext, input: ContractInput) {
  const existing = await db.$count(contract, eq(contract.householdId, ctx.householdId));
  const [row] = await db
    .insert(contract)
    .values({
      householdId: ctx.householdId,
      name: input.name,
      kind: input.contract.kind,
      config: input.contract,
      isCurrent: existing === 0,
    })
    .returning();
  return row ?? null;
}

export async function updateContract(ctx: HouseholdContext, id: string, input: ContractInput) {
  const [row] = await db
    .update(contract)
    .set({ name: input.name, kind: input.contract.kind, config: input.contract })
    .where(own(ctx, id))
    .returning();
  return row ?? null;
}

export async function duplicateContract(ctx: HouseholdContext, id: string) {
  const source = await getContract(ctx, id);
  if (!source) return null;
  const [row] = await db
    .insert(contract)
    .values({
      householdId: ctx.householdId,
      name: `${source.name} (copie)`.slice(0, 60),
      kind: source.kind,
      config: source.config,
      isCurrent: false,
    })
    .returning();
  return row ?? null;
}

export async function deleteContract(ctx: HouseholdContext, id: string): Promise<boolean> {
  const rows = await db.delete(contract).where(own(ctx, id)).returning({ id: contract.id });
  return rows.length > 0;
}

/** Désigne le contrat actuel (un seul par foyer). */
export async function setCurrentContract(ctx: HouseholdContext, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ id: contract.id }).from(contract).where(own(ctx, id));
    if (!target) return false;
    await tx
      .update(contract)
      .set({ isCurrent: false })
      .where(and(eq(contract.householdId, ctx.householdId), ne(contract.id, id)));
    await tx.update(contract).set({ isCurrent: true }).where(own(ctx, id));
    return true;
  });
}
