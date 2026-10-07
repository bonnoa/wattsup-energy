import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { idea, ideaVote, user } from "@/db/schema";
import type { IdeaStatus } from "@/domain/ideas";
import { newIdeaEmail } from "@/domain/mail";
import { requireAdmin } from "./admin";
import type { HouseholdContext } from "./context";
import { mailConfigured, sendMail } from "./mail";

// Boîte à idées (SPEC §9) : liste commune à tous les comptes de l'instance, un vote par
// compte. Changer le statut et supprimer sont réservés à l'administrateur, qui voit aussi
// l'auteur ; les autres comptes ne le voient pas.

export interface IdeaView {
  id: string;
  title: string;
  description: string;
  status: IdeaStatus;
  version: string | null;
  /** Instant ISO. */
  createdAt: string;
  votes: number;
  /** Le compte courant a voté. */
  voted: boolean;
  /** Auteur (« Nom <email> »), pour l'administrateur seulement ; null sinon ou compte supprimé. */
  author: string | null;
}

export async function listIdeas(ctx: HouseholdContext): Promise<IdeaView[]> {
  const rows = await db
    .select({
      id: idea.id,
      title: idea.title,
      description: idea.description,
      status: idea.status,
      version: idea.version,
      createdAt: idea.createdAt,
      votes: sql<number>`(select count(*) from ${ideaVote} where ${ideaVote.ideaId} = ${idea.id})::int`,
      voted: sql<boolean>`exists (select 1 from ${ideaVote} where ${ideaVote.ideaId} = ${idea.id} and ${ideaVote.userId} = ${ctx.userId})`,
      authorName: user.name,
      authorEmail: user.email,
    })
    .from(idea)
    .leftJoin(user, eq(user.id, idea.authorId))
    .orderBy(desc(idea.createdAt));
  return rows.map(({ authorName, authorEmail, createdAt, ...r }) => ({
    ...r,
    createdAt: createdAt.toISOString(),
    author: ctx.isAdmin && authorEmail ? `${authorName} <${authorEmail}>` : null,
  }));
}

/** Prévient chaque administrateur par email ; un échec d'envoi ne bloque pas l'idée. */
async function notifyAdmins(content: Parameters<typeof sendMail>[1]) {
  if (!mailConfigured()) return;
  const admins = await db.select({ email: user.email }).from(user).where(eq(user.isAdmin, true));
  await Promise.all(
    admins.map((a) =>
      sendMail(a.email, content).catch((err: unknown) =>
        console.error("[ideas] email à l'administrateur non envoyé :", err),
      ),
    ),
  );
}

/** Enregistre une idée (validée par parseIdeaInput) et prévient l'administrateur. */
export async function createIdea(
  ctx: HouseholdContext,
  input: { title: string; description: string },
  options: { url: string; notify?: typeof notifyAdmins } = { url: "" },
): Promise<string> {
  const [row] = await db
    .insert(idea)
    .values({ ...input, authorId: ctx.userId })
    .returning({ id: idea.id });
  if (!row) throw new Error("idée non enregistrée");
  await (options.notify ?? notifyAdmins)(
    newIdeaEmail({
      ...input,
      authorName: ctx.userName,
      authorEmail: ctx.userEmail,
      url: options.url,
    }),
  );
  return row.id;
}

/** Ajoute le vote du compte courant, ou le retire. null si l'idée n'existe pas. */
export async function toggleVote(
  ctx: HouseholdContext,
  ideaId: string,
): Promise<{ voted: boolean } | null> {
  return db.transaction(async (tx) => {
    const [exists] = await tx.select({ id: idea.id }).from(idea).where(eq(idea.id, ideaId));
    if (!exists) return null;
    const removed = await tx
      .delete(ideaVote)
      .where(and(eq(ideaVote.ideaId, ideaId), eq(ideaVote.userId, ctx.userId)))
      .returning({ ideaId: ideaVote.ideaId });
    if (removed.length > 0) return { voted: false };
    await tx.insert(ideaVote).values({ ideaId, userId: ctx.userId }).onConflictDoNothing();
    return { voted: true };
  });
}

/** Statut d'une idée (administrateur) ; la version ne se garde que pour « terminée ». */
export async function setIdeaStatus(
  ctx: HouseholdContext,
  ideaId: string,
  status: IdeaStatus,
  version: string | null,
): Promise<boolean> {
  requireAdmin(ctx);
  const rows = await db
    .update(idea)
    .set({ status, version: status === "done" ? version : null })
    .where(eq(idea.id, ideaId))
    .returning({ id: idea.id });
  return rows.length > 0;
}

/** Supprime une idée et ses votes (administrateur). */
export async function deleteIdea(ctx: HouseholdContext, ideaId: string): Promise<boolean> {
  requireAdmin(ctx);
  const rows = await db.delete(idea).where(eq(idea.id, ideaId)).returning({ id: idea.id });
  return rows.length > 0;
}
