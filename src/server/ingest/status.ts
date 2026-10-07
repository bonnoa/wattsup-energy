import { and, desc, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { ingestLog } from "@/db/schema";
import type { HouseholdContext } from "../context";

/** Date du dernier push ordinaire accepté (HTTP 200, hors historique et décompte), ou null. */
export async function getLastPushAt(ctx: HouseholdContext): Promise<Date | null> {
  const [row] = await db
    .select({ at: ingestLog.receivedAt })
    .from(ingestLog)
    .where(
      and(
        eq(ingestLog.householdId, ctx.householdId),
        eq(ingestLog.httpStatus, 200),
        notInArray(ingestLog.mode, ["backfill", "fuel"]),
      ),
    )
    .orderBy(desc(ingestLog.receivedAt))
    .limit(1);
  return row?.at ?? null;
}

/** Journal des derniers envois (accepté ou refusé), du plus récent au plus ancien. */
export async function listIngestLog(ctx: HouseholdContext, limit = 20) {
  return db
    .select({
      id: ingestLog.id,
      receivedAt: ingestLog.receivedAt,
      httpStatus: ingestLog.httpStatus,
      mode: ingestLog.mode,
      payloadSize: ingestLog.payloadSize,
      warnings: ingestLog.warnings,
      error: ingestLog.error,
    })
    .from(ingestLog)
    .where(eq(ingestLog.householdId, ctx.householdId))
    .orderBy(desc(ingestLog.receivedAt))
    .limit(limit);
}
