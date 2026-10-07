import type { NextConfig } from "next";
import { API_CSP, SECURITY_HEADERS } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  // Build séparé pour les tests de bout en bout (ne touche pas au cache du serveur de dev).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  // En-têtes de sécurité sur toutes les réponses ; la CSP des pages (nonce) est posée par le
  // middleware, l'API reçoit une CSP fermée.
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: API_CSP }] },
    ];
  },
  // Le blueprint Home Assistant est servi tel quel (T31) : à embarquer dans le build autonome.
  outputFileTracingIncludes: {
    "/api/blueprint/wattsup_push.yaml": ["./homeassistant/blueprints/wattsup_push.yaml"],
    "/api/blueprint/wattsup_history.yaml": ["./homeassistant/blueprints/wattsup_history.yaml"],
    "/api/blueprint/wattsup_fuel.yaml": ["./homeassistant/blueprints/wattsup_fuel.yaml"],
  },
};

export default nextConfig;
