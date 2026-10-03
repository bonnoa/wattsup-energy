import { CSV_LIMITS } from "@/domain/ingest/csv";
import { importCsv } from "@/server/csv/import";
import { getHouseholdContext, UnauthorizedError } from "@/server/context";

// Import CSV depuis Réglages (T22), authentifié par la session. Le corps est lu en flux ;
// la réponse est du NDJSON : une ligne `progress` par lot écrit, puis le `report` final.

export const runtime = "nodejs";

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await getHouseholdContext();
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return Response.json({ error: "non authentifié" }, { status: 401 });
    throw err;
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > CSV_LIMITS.bytes) {
    return Response.json({ error: "fichier de plus de 20 Mo" }, { status: 413 });
  }
  if (!request.body) return Response.json({ error: "fichier vide" }, { status: 400 });
  const body = request.body;
  const household = ctx;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const report = await importCsv(household, body, (r) =>
          send({ type: "progress", lines: r.lines, imported: r.imported }),
        );
        send({ type: "report", report });
      } catch (err) {
        console.error("[csv-import] échec", err);
        send({ type: "error", error: "import interrompu : réessayez" });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
