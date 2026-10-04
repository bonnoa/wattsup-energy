import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Le blueprint Home Assistant est servi tel quel (T31) : à embarquer dans le build autonome.
  outputFileTracingIncludes: {
    "/api/blueprint/wattsup_push.yaml": ["./homeassistant/blueprints/wattsup_push.yaml"],
  },
};

export default nextConfig;
