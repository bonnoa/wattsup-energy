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

  const result = await ingest(auth.householdId, body);
  return Response.json(result.body, { status: result.status });
}

const tooLarge = () =>
  Response.json({ ok: false, error: "corps trop volumineux : 64 Ko au maximum" }, { status: 413 });
