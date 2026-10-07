import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Build séparé pour les tests de bout en bout (ne touche pas au cache du serveur de dev).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  // Le blueprint Home Assistant est servi tel quel (T31) : à embarquer dans le build autonome.
  outputFileTracingIncludes: {
    "/api/blueprint/wattsup_push.yaml": ["./homeassistant/blueprints/wattsup_push.yaml"],
    "/api/blueprint/wattsup_history.yaml": ["./homeassistant/blueprints/wattsup_history.yaml"],
    "/api/blueprint/wattsup_fuel.yaml": ["./homeassistant/blueprints/wattsup_fuel.yaml"],
  },
};

export default nextConfig;
