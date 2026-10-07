import { serveBlueprint } from "../serve";

// Blueprint de décompte d'un combustible (script « sac versé »).

export const runtime = "nodejs";
export const dynamic = "force-static";

export const GET = () => serveBlueprint("wattsup_fuel.yaml");
