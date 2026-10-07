import { getHouseholdContext, UnauthorizedError, type HouseholdContext } from "@/server/context";

/** Contexte de la session, ou réponse 401 (les routes /api ne passent pas par le middleware). */
export async function exportContext(): Promise<HouseholdContext | Response> {
  try {
    return await getHouseholdContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: "non authentifié" }, { status: 401 });
    }
    throw err;
  }
}

/** En-têtes d'un fichier à télécharger, jamais mis en cache. */
export const attachment = (filename: string, type: string) => ({
  "content-type": type,
  "content-disposition": `attachment; filename="${filename}"`,
  "cache-control": "no-store",
});
