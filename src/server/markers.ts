import { and, asc, eq, gte, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { marker } from "@/db/schema";
import type { Marker, MarkerKind } from "@/domain/markers";
import type { HouseholdContext } from "./context";

// Repères saisis (SPEC §7.10). Chaque opération filtre par ctx.householdId : l'id d'un autre
// foyer se comporte comme un id inconnu.

/** Refus métier, message en français pour l'interface. */
export class MarkerError extends Error {}

export interface MarkerInput {
  kind: MarkerKind;
  text: string;
  startDate: string;
  endDate: string | null;
}

const toMarker = (r: typeof marker.$inferSelect): Marker => ({
  id: r.id,
  kind: r.kind,
  text: r.text,
  startDate: r.startDate,
  endDate: r.endDate,
});

function clean(input: MarkerInput): MarkerInput {
  const text = input.text.trim();
  if (!text) throw new MarkerError("texte attendu");
  // Une fin égale au début est un repère d'un jour.
  const endDate = input.endDate === input.startDate ? null : input.endDate;
  if (endDate !== null && endDate < input.startDate) {
    throw new MarkerError("la fin précède le début");
  }
  return { ...input, text, endDate };
}

/** Repères saisis qui touchent les jours [from, to). */
export async function listMarkers(
  ctx: HouseholdContext,
  from: string,
  to: string,
): Promise<Marker[]> {
  const rows = await db
    .select()
    .from(marker)
    .where(
      and(
        eq(marker.householdId, ctx.householdId),
        lt(marker.startDate, to),
        or(gte(marker.endDate, from), and(isNull(marker.endDate), gte(marker.startDate, from))),
      ),
    )
    .orderBy(asc(marker.startDate));
  return rows.map(toMarker);
}

export async function createMarker(ctx: HouseholdContext, input: MarkerInput) {
  const [row] = await db
    .insert(marker)
    .values({ ...clean(input), householdId: ctx.householdId })
    .returning();
  return row ? toMarker(row) : null;
}

export async function updateMarker(ctx: HouseholdContext, id: string, input: MarkerInput) {
  const [row] = await db
    .update(marker)
    .set(clean(input))
    .where(and(eq(marker.id, id), eq(marker.householdId, ctx.householdId)))
    .returning();
  return row ? toMarker(row) : null;
}

export async function deleteMarker(ctx: HouseholdContext, id: string): Promise<boolean> {
  const rows = await db
    .delete(marker)
    .where(and(eq(marker.id, id), eq(marker.householdId, ctx.householdId)))
    .returning({ id: marker.id });
  return rows.length > 0;
}
