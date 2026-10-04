import { redirect } from "next/navigation";
import { visibleModules } from "@/domain/profile";
import { getHouseholdContext, UnauthorizedError, type HouseholdContext } from "./context";

/**
 * Contexte d'une page de l'application : redirige vers /connexion sans session, vers /
 * si la page appartient à un module masqué par le profil, et vers /bienvenue tant que le
 * parcours de bienvenue n'est pas terminé.
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
  // Premier passage : le parcours de bienvenue tant qu'il n'est ni terminé ni passé.
  if (pathname && pathname !== "/bienvenue" && !ctx.onboarding.done) redirect("/bienvenue");
  return ctx;
}
