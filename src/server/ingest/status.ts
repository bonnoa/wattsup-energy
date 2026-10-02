import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ingestLog } from "@/db/schema";
import type { HouseholdContext } from "../context";

/** Date du dernier push accepté (HTTP 200), ou null si aucun. */
export async function getLastPushAt(ctx: HouseholdContext): Promise<Date | null> {
  const [row] = await db
    .select({ at: ingestLog.receivedAt })
    .from(ingestLog)
    .where(and(eq(ingestLog.householdId, ctx.householdId), eq(ingestLog.httpStatus, 200)))
    .orderBy(desc(ingestLog.receivedAt))
    .limit(1);
  return row?.at ?? null;
}
