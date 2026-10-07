import { eq } from "drizzle-orm";
import { db } from "@/db";
import { household } from "@/db/schema";
import { householdContextFor } from "@/server/context";
import { verifyIngestToken } from "@/server/ingest/token";
import { summaryRateLimiter } from "@/server/rate-limit";
import { getSummary } from "@/server/summary";

// GET /api/v1/summary : résumé en lecture seule pour les capteurs REST de Home Assistant
// (SPEC §6.6), avec le token d'ingestion. Token inconnu, révoqué ou compte désactivé : 401.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const auth = await verifyIngestToken(request.headers.get("authorization"));
  if (!auth) return Response.json({ ok: false }, { status: 401 });

  const limit = summaryRateLimiter.hit(auth.tokenId);
  if (!limit.allowed) {
    return Response.json(
      { ok: false, error: "trop de requêtes : 30 par minute au maximum" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const [home] = await db
    .select({ ownerId: household.ownerId })
    .from(household)
    .where(eq(household.id, auth.householdId));
  if (!home) return Response.json({ ok: false }, { status: 401 });
  const ctx = await householdContextFor(home.ownerId);
  return Response.json(await getSummary(ctx), { headers: { "cache-control": "no-store" } });
}
