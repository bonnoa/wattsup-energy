import { serveBlueprint } from "../serve";

// Blueprint d'envoi de l'historique à la demande (script).

export const runtime = "nodejs";
export const dynamic = "force-static";

export const GET = () => serveBlueprint("wattsup_history.yaml");
