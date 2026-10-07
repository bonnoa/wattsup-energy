import { readFile } from "node:fs/promises";
import path from "node:path";

// Blueprints Home Assistant (homeassistant/blueprints), publics : HA les importe depuis
// ces adresses, l'utilisateur peut aussi les télécharger.

export async function serveBlueprint(
  file: "wattsup_push.yaml" | "wattsup_history.yaml" | "wattsup_fuel.yaml",
) {
  const yaml = await readFile(path.join(process.cwd(), "homeassistant/blueprints", file), "utf8");
  return new Response(yaml, {
    headers: {
      "content-type": "text/yaml; charset=utf-8",
      "content-disposition": `inline; filename="${file}"`,
      "cache-control": "public, max-age=3600",
    },
  });
}
