import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";

/**
 * Session de la requête en cours (null sans connexion), lue une seule fois par requête :
 * la mise en page racine (thème) et le contexte du foyer la partagent.
 */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));
