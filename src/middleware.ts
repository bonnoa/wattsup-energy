import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { pageCsp } from "@/lib/security-headers";

// Garde légère : présence du cookie de session. La vérification complète de la
// session se fait côté serveur dans getHouseholdContext() (T3). Pose aussi la CSP des
// pages avec un nonce par requête, que Next.js reprend sur ses propres scripts.

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

  const csp = pageCsp(btoa(crypto.randomUUID()), process.env.NODE_ENV === "development");
  const headers = new Headers(request.headers);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  // Exclut l'API (auth, ingestion par token, santé) et les fichiers statiques.
  // Le manifeste, les icônes et le service worker de l'appli installable restent publics.
  matcher: ["/((?!api|_next/static|_next/image|sw\\.js$|.*\\.(?:svg|png|ico|txt|webmanifest)$).*)"],
};
