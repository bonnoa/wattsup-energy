"use server";

import { revalidatePath } from "next/cache";
import { parseContractInput } from "@/domain/tariff/schema";
import { getHouseholdContext } from "../context";
import {
  createContract,
  deleteContract,
  duplicateContract,
  setCurrentContract,
  updateContract,
} from "../contracts";

export type ContractActionResult =
  { ok: true; id: string } | { ok: false; errors: { path: string; message: string }[] };

const notFound: ContractActionResult = {
  ok: false,
  errors: [{ path: "", message: "contrat introuvable" }],
};

/** Crée (sans id) ou modifie un contrat après validation complète. */
export async function saveContractAction(
  id: string | null,
  input: unknown,
): Promise<ContractActionResult> {
  const parsed = parseContractInput(input);
  if (!parsed.success) return { ok: false, errors: parsed.errors };
  const ctx = await getHouseholdContext();
  const row = id
    ? await updateContract(ctx, id, parsed.data)
    : await createContract(ctx, parsed.data);
  revalidatePath("/contrats");
  return row ? { ok: true, id: row.id } : notFound;
}

export async function duplicateContractAction(id: string): Promise<ContractActionResult> {
  const row = await duplicateContract(await getHouseholdContext(), id);
  revalidatePath("/contrats");
  return row ? { ok: true, id: row.id } : notFound;
}

export async function deleteContractAction(id: string): Promise<{ ok: boolean }> {
  const ok = await deleteContract(await getHouseholdContext(), id);
  revalidatePath("/contrats");
  return { ok };
}

export async function setCurrentContractAction(id: string): Promise<{ ok: boolean }> {
  const ok = await setCurrentContract(await getHouseholdContext(), id);
  revalidatePath("/contrats");
  return { ok };
}
