import { isBackfill } from "@/domain/ingest/backfill";
import { isFuelEvent } from "@/domain/ingest/fuel-event";
import { backfill } from "@/server/ingest/backfill";
import { fuelEvent } from "@/server/ingest/fuel-event";
import { ingest } from "@/server/ingest/persist";
import { verifyIngestToken } from "@/server/ingest/token";
import { ingestRateLimiter } from "@/server/rate-limit";

// POST /api/v1/ingest : point d'entrée des pushes Home Assistant (SPEC §6).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<Response> {
  const auth = await verifyIngestToken(request.headers.get("authorization"));
  if (!auth) return Response.json({ ok: false }, { status: 401 });

  const limit = ingestRateLimiter.hit(auth.tokenId);
  if (!limit.allowed) {
    return Response.json(
      { ok: false, error: "trop de requêtes : 120 par minute au maximum" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return tooLarge();
  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) return tooLarge();

  // Décompte d'un combustible (bloc `fuel_event`, §6.5) et historique (bloc `backfill`,
  // §6.4) : traitements à part ; tout autre envoi suit le chemin ordinaire, inchangé.
  const json = parseJson(body);
  if (isFuelEvent(json)) {
    const result = await fuelEvent(auth.householdId, json, body);
    return Response.json(result.body, { status: result.status });
  }
  if (isBackfill(json)) {
    const result = await backfill(auth.householdId, json, body);
    return Response.json(result.body, { status: result.status });
  }
  const result = await ingest(auth.householdId, body);
  return Response.json(result.body, { status: result.status });
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null; // le chemin ordinaire journalise le JSON invalide
  }
}

const tooLarge = () =>
  Response.json({ ok: false, error: "corps trop volumineux : 64 Ko au maximum" }, { status: 413 });
