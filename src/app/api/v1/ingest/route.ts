import { ingest } from "@/server/ingest/persist";
import { verifyIngestToken } from "@/server/ingest/token";

// POST /api/v1/ingest : point d'entrée des pushes Home Assistant (SPEC §6).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const auth = await verifyIngestToken(request.headers.get("authorization"));
  if (!auth) return Response.json({ ok: false }, { status: 401 });

  const body = await request.text();
  const result = await ingest(auth.householdId, body);
  return Response.json(result.body, { status: result.status });
}
