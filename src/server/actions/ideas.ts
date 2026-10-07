"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { publicOrigin } from "@/domain/blueprint";
import { IDEA_STATUSES, parseIdeaInput, parseVersion, type IdeaStatus } from "@/domain/ideas";
import { ForbiddenError } from "../admin";
import { getHouseholdContext } from "../context";
import { createIdea, deleteIdea, setIdeaStatus, toggleVote } from "../ideas";
import { MemoryRateLimiter } from "../rate-limit";

export type IdeaActionResult = { ok: true } | { ok: false; errors: string[] };

/** 5 idées par heure et par compte : de quoi proposer, pas de quoi inonder la boîte. */
const proposeLimiter = new MemoryRateLimiter({ limit: 5, windowMs: 3_600_000 });

const id = z.uuid();
const NOT_FOUND: IdeaActionResult = { ok: false, errors: ["idée introuvable"] };

async function run(fn: () => Promise<boolean>): Promise<IdeaActionResult> {
  try {
    const found = await fn();
    revalidatePath("/idees");
    return found ? { ok: true } : NOT_FOUND;
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, errors: [err.message] };
    throw err;
  }
}

export async function proposeIdeaAction(raw: {
  title: unknown;
  description: unknown;
}): Promise<IdeaActionResult> {
  const parsed = parseIdeaInput(raw);
  if (!parsed.ok) return parsed;
  const ctx = await getHouseholdContext();
  const limit = proposeLimiter.hit(ctx.userId);
  if (!limit.allowed) {
    return {
      ok: false,
      errors: [
        `Vous avez proposé 5 idées dans l'heure : réessayez dans ${Math.ceil((limit.retryAfterSec ?? 60) / 60)} min.`,
      ],
    };
  }
  const h = await headers();
  const url = `${publicOrigin(process.env.BETTER_AUTH_URL ?? "http://localhost:3000", h)}/idees`;
  return run(async () => {
    await createIdea(ctx, parsed.value, { url });
    return true;
  });
}

export async function toggleVoteAction(ideaId: string): Promise<IdeaActionResult> {
  if (!id.safeParse(ideaId).success) return NOT_FOUND;
  const ctx = await getHouseholdContext();
  return run(async () => (await toggleVote(ctx, ideaId)) !== null);
}

/** Statut d'une idée (administrateur) ; « terminée » exige la version qui la livre. */
export async function setIdeaStatusAction(
  ideaId: string,
  status: IdeaStatus,
  rawVersion: string,
): Promise<IdeaActionResult> {
  if (!id.safeParse(ideaId).success) return NOT_FOUND;
  if (!IDEA_STATUSES.includes(status)) return { ok: false, errors: ["statut inconnu"] };
  const version = status === "done" ? parseVersion(String(rawVersion ?? "")) : null;
  if (status === "done" && !version) {
    return { ok: false, errors: ["Indiquez la version qui livre l'idée (ex. 1.2.0)."] };
  }
  const ctx = await getHouseholdContext();
  return run(() => setIdeaStatus(ctx, ideaId, status, version));
}

export async function deleteIdeaAction(ideaId: string): Promise<IdeaActionResult> {
  if (!id.safeParse(ideaId).success) return NOT_FOUND;
  const ctx = await getHouseholdContext();
  return run(() => deleteIdea(ctx, ideaId));
}
