import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Garde légère : présence du cookie de session. La vérification complète de la
// session se fait côté serveur dans getHouseholdContext() (T3).

const PUBLIC_PATHS = [
  "/connexion",
  "/inscription",
  "/mot-de-passe-oublie",
  "/nouveau-mot-de-passe",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSession = Boolean(getSessionCookie(request));

  if (!hasSession && !isPublic) {
    const url = new URL("/connexion", request.url);
    if (pathname !== "/") url.searchParams.set("suite", pathname);
    return NextResponse.redirect(url);
  }
  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Exclut l'API (auth, ingestion par token, santé) et les fichiers statiques.
  // Le manifeste et les icônes de l'appli installable restent publics.
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:svg|png|ico|txt|webmanifest)$).*)"],
};
