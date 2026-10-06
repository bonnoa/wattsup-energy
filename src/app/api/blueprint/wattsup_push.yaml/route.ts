import { serveBlueprint } from "../serve";

// Blueprint d'envoi des données (automatisation).

export const runtime = "nodejs";
export const dynamic = "force-static";

export const GET = () => serveBlueprint("wattsup_push.yaml");
