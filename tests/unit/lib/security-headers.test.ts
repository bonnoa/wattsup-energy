import { describe, expect, it } from "vitest";
import { pageCsp, SECURITY_HEADERS } from "@/lib/security-headers";

describe("pageCsp", () => {
  it("n'autorise que les scripts portant le nonce de la requête", () => {
    const csp = pageCsp("abc123");
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("permet eval en développement seulement", () => {
    expect(pageCsp("n", true)).toContain("'unsafe-eval'");
  });
});

describe("SECURITY_HEADERS", () => {
  it("HSTS, nosniff et interdiction des cadres", () => {
    const byKey = Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key, h.value]));
    expect(byKey["Strict-Transport-Security"]).toMatch(/max-age=31536000/);
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
  });
});
