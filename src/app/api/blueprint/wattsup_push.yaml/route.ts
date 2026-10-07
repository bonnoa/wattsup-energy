import { serveBlueprint } from "../serve";

// Blueprint d'envoi des données (automatisation).

export const runtime = "nodejs";
// Dépend de l'adresse de la requête (source_url) : rendu à chaque appel.
export const dynamic = "force-dynamic";

export const GET = (request: Request) => serveBlueprint(request, "wattsup_push.yaml");
