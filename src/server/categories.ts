import { and, asc, desc, eq, gte, like, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, energyInterval, ingestLog, meterState } from "@/db/schema";
import { unknownSlugs, type CategoryInput } from "@/domain/categories";
import type { HouseholdContext } from "./context";

// Postes de consommation (T19). Chaque opération filtre par ctx.householdId. Les données
// d'un poste sont rangées sous la métrique `category:<slug>` : changer le slug les renomme,
// supprimer le poste les supprime.

const metricOf = (slug: string) => `category:${slug}`;
const DAY_MS = 86_400_000;

/** Refus métier, message en français pour l'interface. */
export class CategoryError extends Error {}

export interface CategoryWithStats {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  isHeating: boolean;
  /** kWh reçus sur les 30 derniers jours. */
  kwh30d: number;
  /** Début du dernier intervalle reçu, null si aucune donnée. */
  lastDataAt: Date | null;
}

export async function listCategories(
  ctx: HouseholdContext,
  now = new Date(),
): Promise<CategoryWithStats[]> {
  const [rows, stats] = await Promise.all([
    db
      .select()
      .from(category)
      .where(eq(category.householdId, ctx.householdId))
      .orderBy(asc(category.createdAt)),
    db
      .select({
        metric: energyInterval.metric,
        kwh30d:
          sql<number>`coalesce(sum(${energyInterval.kwh}) filter (where ${energyInterval.start} >= ${new Date(now.getTime() - 30 * DAY_MS).toISOString()}::timestamptz), 0)`.mapWith(
            Number,
          ),
        lastDataAt: max(energyInterval.start),
      })
      .from(energyInterval)
      .where(
        and(
          eq(energyInterval.householdId, ctx.householdId),
          like(energyInterval.metric, "category:%"),
        ),
      )
      .groupBy(energyInterval.metric),
  ]);
  const byMetric = new Map(stats.map((s) => [s.metric, s]));
  return rows.map((c) => {
    const s = byMetric.get(metricOf(c.slug));
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      color: c.color,
      isHeating: c.isHeating,
      kwh30d: s?.kwh30d ?? 0,
      lastDataAt: s?.lastDataAt ?? null,
    };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function assertSlugFree(tx: Tx, ctx: HouseholdContext, slug: string, exceptId?: string) {
  const [taken] = await tx
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.householdId, ctx.householdId), eq(category.slug, slug)));
  if (taken && taken.id !== exceptId) {
    throw new CategoryError(`le slug « ${slug} » est déjà utilisé par un autre poste`);
  }
}

export async function createCategory(ctx: HouseholdContext, input: CategoryInput) {
  return db.transaction(async (tx) => {
    await assertSlugFree(tx, ctx, input.slug);
    const [row] = await tx
      .insert(category)
      .values({ householdId: ctx.householdId, ...input })
      .returning();
    return row ?? null;
  });
}

/** Modifie un poste ; un nouveau slug renomme ses données déjà reçues. */
export async function updateCategory(ctx: HouseholdContext, id: string, input: CategoryInput) {
  return db.transaction(async (tx) => {
    const [old] = await tx
      .select({ slug: category.slug })
      .from(category)
      .where(and(eq(category.id, id), eq(category.householdId, ctx.householdId)));
    if (!old) return null;
    if (old.slug !== input.slug) {
      await assertSlugFree(tx, ctx, input.slug, id);
      for (const table of [energyInterval, meterState]) {
        await tx
          .update(table)
          .set({ metric: metricOf(input.slug) })
          .where(and(eq(table.householdId, ctx.householdId), eq(table.metric, metricOf(old.slug))));
      }
    }
    const [row] = await tx
      .update(category)
      .set(input)
      .where(and(eq(category.id, id), eq(category.householdId, ctx.householdId)))
      .returning();
    return row ?? null;
  });
}

/** Supprime un poste et ses données. */
export async function deleteCategory(ctx: HouseholdContext, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(category)
      .where(and(eq(category.id, id), eq(category.householdId, ctx.householdId)))
      .returning({ slug: category.slug });
    if (!row) return false;
    for (const table of [energyInterval, meterState]) {
      await tx
        .delete(table)
        .where(and(eq(table.householdId, ctx.householdId), eq(table.metric, metricOf(row.slug))));
    }
    return true;
  });
}

/** Slugs envoyés par Home Assistant ces 7 derniers jours sans poste correspondant. */
export async function unknownCategorySlugs(ctx: HouseholdContext, now = new Date()) {
  const [logs, existing] = await Promise.all([
    db
      .select({ warnings: ingestLog.warnings })
      .from(ingestLog)
      .where(
        and(
          eq(ingestLog.householdId, ctx.householdId),
          eq(ingestLog.httpStatus, 200),
          gte(ingestLog.receivedAt, new Date(now.getTime() - 7 * DAY_MS)),
        ),
      )
      .orderBy(desc(ingestLog.receivedAt))
      .limit(200),
    db
      .select({ slug: category.slug })
      .from(category)
      .where(eq(category.householdId, ctx.householdId)),
  ]);
  return unknownSlugs(
    logs.map((l) => l.warnings),
    existing.map((c) => c.slug),
  );
}
