// En-têtes de sécurité (SPEC §12) : partagés par next.config.ts (toutes les réponses) et
// le middleware (CSP des pages, avec un nonce par requête). Pur.

/** Posés sur toutes les réponses, pages comme API. */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  // HTTPS seulement pendant un an (ignoré par le navigateur en HTTP, donc en local).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

/** API (JSON, CSV, YAML) : rien à exécuter ni à afficher dans un cadre. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/**
 * CSP des pages : scripts de Next.js seulement (nonce de la requête), styles en ligne
 * permis (attributs `style`, styles injectés par Next), aucune ressource externe. En
 * développement, React a besoin de `eval` pour ses outils de débogage.
 */
export function pageCsp(nonce: string, dev = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
