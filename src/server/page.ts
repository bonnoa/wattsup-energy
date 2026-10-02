import { redirect } from "next/navigation";
import { visibleModules } from "@/domain/profile";
import { getHouseholdContext, UnauthorizedError, type HouseholdContext } from "./context";

/**
 * Contexte d'une page de l'application : redirige vers /connexion sans session,
 * et vers / si la page appartient à un module masqué par le profil.
 */
export async function pageContext(pathname?: string): Promise<HouseholdContext> {
  let ctx: HouseholdContext;
  try {
    ctx = await getHouseholdContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/connexion");
    throw err;
  }
  if (pathname && !visibleModules(ctx.profile).isRouteVisible(pathname)) redirect("/");
  return ctx;
}
