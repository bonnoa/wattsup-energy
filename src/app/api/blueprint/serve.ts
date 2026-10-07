import { readFile } from "node:fs/promises";
import path from "node:path";
import { publicOrigin, withSourceUrl } from "@/domain/blueprint";

// Blueprints Home Assistant (homeassistant/blueprints), publics : HA les importe depuis
// ces adresses, l'utilisateur peut aussi les télécharger. `source_url` est réécrit sur
// l'adresse de l'instance qui les sert (le fichier du dépôt garde l'adresse GitHub).

export type BlueprintFile = "wattsup_push.yaml" | "wattsup_history.yaml" | "wattsup_fuel.yaml";

export async function serveBlueprint(request: Request, file: BlueprintFile) {
  const yaml = await readFile(path.join(process.cwd(), "homeassistant/blueprints", file), "utf8");
  const self = `${publicOrigin(request.url, request.headers)}/api/blueprint/${file}`;
  return new Response(withSourceUrl(yaml, self), {
    headers: {
      "content-type": "text/yaml; charset=utf-8",
      "content-disposition": `inline; filename="${file}"`,
      "cache-control": "public, max-age=3600",
      vary: "host, x-forwarded-host, x-forwarded-proto",
    },
  });
}
