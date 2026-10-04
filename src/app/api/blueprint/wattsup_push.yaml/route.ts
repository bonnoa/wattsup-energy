import { readFile } from "node:fs/promises";
import path from "node:path";

// Blueprint Home Assistant (homeassistant/blueprints/wattsup_push.yaml), public : HA
// l'importe depuis cette adresse, l'utilisateur peut aussi le télécharger.

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  const yaml = await readFile(
    path.join(process.cwd(), "homeassistant/blueprints/wattsup_push.yaml"),
    "utf8",
  );
  return new Response(yaml, {
    headers: {
      "content-type": "text/yaml; charset=utf-8",
      "content-disposition": 'inline; filename="wattsup_push.yaml"',
      "cache-control": "public, max-age=3600",
    },
  });
}
