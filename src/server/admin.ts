import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, energyInterval, household, ingestLog, session, user } from "@/db/schema";
import type { EnergyProfile } from "@/domain/profile";
import type { HouseholdContext } from "./context";

// Administration de l'instance (SPEC §9, Utilisateurs) : réservée aux comptes `user.is_admin`.
// Sur une instance neuve, le premier compte créé devient administrateur. Ces opérations sortent du cadre d'un foyer ; elles ne touchent jamais
// au compte de l'administrateur lui-même (ni à celui d'un autre administrateur).

/** Opération réservée à l'administrateur. */
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor() {
    super("réservé à l'administrateur");
  }
}

/** Refus métier, message en français pour l'interface. */
export class AdminError extends Error {}

export function requireAdmin(ctx: HouseholdContext) {
  if (!ctx.isAdmin) throw new ForbiddenError();
}

/**
 * Premier compte d'une instance sans administrateur : il le devient (en une seule requête,
 * deux inscriptions simultanées ne peuvent pas être promues toutes les deux). Renvoie true
 * si le compte a été promu.
 */
export async function promoteFirstAdmin(userId: string): Promise<boolean> {
  const rows = await db.execute<{ id: string }>(sql`
    update "user" set is_admin = true
    where id = ${userId}
      and not exists (select 1 from "user" where is_admin)
    returning id`);
  return rows.length > 0;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  isAdmin: boolean;
  disabledAt: Date | null;
  /** Profil énergétique du foyer ; null si le foyer n'a pas encore été créé. */
  profile: EnergyProfile | null;
  /** Postes de consommation créés. */
  categories: number;
  /** Valeurs d'énergie enregistrées (heures ou jours, toutes métriques et sources). */
  values: number;
  /** Granularité des envois du foyer (seuil de retard du statut HA). */
  granularity: "hourly" | "daily" | null;
  /**
   * Dernier envoi Home Assistant accepté, hors historique et combustible (comme le statut HA
   * du menu) ; null si aucun dans le journal (gardé 30 jours).
   */
  lastPushAt: Date | null;
}

/** Tous les comptes de l'instance, du plus récent au plus ancien. */
export async function listUsers(ctx: HouseholdContext): Promise<AdminUser[]> {
  requireAdmin(ctx);
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      isAdmin: user.isAdmin,
      disabledAt: user.disabledAt,
      profile: household.profile,
      categories: sql<number>`(select count(*) from ${category} where ${category.householdId} = ${household.id})::int`,
      values: sql<number>`(select count(*) from ${energyInterval} where ${energyInterval.householdId} = ${household.id})::int`,
      granularity: household.granularity,
      lastPushAt:
        sql<Date | null>`(select max(${ingestLog.receivedAt}) from ${ingestLog} where ${ingestLog.householdId} = ${household.id} and ${ingestLog.httpStatus} = 200 and ${ingestLog.mode} not in ('backfill', 'fuel'))`.mapWith(
          (v: string | Date | null) => (v === null ? null : new Date(v)),
        ),
    })
    .from(user)
    .leftJoin(household, eq(household.ownerId, user.id))
    .orderBy(desc(user.createdAt));
}

/** Compte visé par une action : ni le sien, ni celui d'un administrateur. */
async function target(ctx: HouseholdContext, userId: string) {
  requireAdmin(ctx);
  if (userId === ctx.userId) throw new AdminError("impossible sur votre propre compte");
  const [row] = await db.select({ isAdmin: user.isAdmin }).from(user).where(eq(user.id, userId));
  if (row?.isAdmin) throw new AdminError("impossible sur un compte administrateur");
  return row ?? null;
}

/**
 * Désactive (sessions fermées, connexion et envois Home Assistant refusés) ou réactive un
 * compte. Les données sont conservées. false si le compte n'existe pas.
 */
export async function setUserDisabled(
  ctx: HouseholdContext,
  userId: string,
  disabled: boolean,
): Promise<boolean> {
  if (!(await target(ctx, userId))) return false;
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(user)
      .set({ disabledAt: disabled ? new Date() : null })
      .where(and(eq(user.id, userId), eq(user.isAdmin, false)))
      .returning({ id: user.id });
    if (disabled) await tx.delete(session).where(eq(session.userId, userId));
    return rows.length > 0;
  });
}

/** Supprime un compte, son foyer et toutes ses données (cascade). false s'il n'existe pas. */
export async function deleteUserAsAdmin(ctx: HouseholdContext, userId: string): Promise<boolean> {
  if (!(await target(ctx, userId))) return false;
  const rows = await db
    .delete(user)
    .where(and(eq(user.id, userId), eq(user.isAdmin, false)))
    .returning({ id: user.id });
  return rows.length > 0;
}
