import { describe, expect, it } from "vitest";
import { MemoryRateLimiter } from "@/server/rate-limit";

describe("MemoryRateLimiter (fenêtre glissante)", () => {
  it("autorise jusqu'à la limite puis refuse avec un délai d'attente", () => {
    const rl = new MemoryRateLimiter({ limit: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    expect(rl.hit("k", t0).allowed).toBe(true);
    expect(rl.hit("k", t0 + 10_000).allowed).toBe(true);
    expect(rl.hit("k", t0 + 20_000).allowed).toBe(true);
    const refused = rl.hit("k", t0 + 30_000);
    expect(refused).toEqual({ allowed: false, retryAfterSec: 30 });
  });

  it("la fenêtre glisse : la plus ancienne requête sort après windowMs", () => {
    const rl = new MemoryRateLimiter({ limit: 2, windowMs: 60_000 });
    rl.hit("k", 0);
    rl.hit("k", 30_000);
    expect(rl.hit("k", 59_999).allowed).toBe(false);
    expect(rl.hit("k", 60_000).allowed).toBe(true);
  });

  it("une requête refusée ne consomme pas de place", () => {
    const rl = new MemoryRateLimiter({ limit: 1, windowMs: 1_000 });
    rl.hit("k", 0);
    rl.hit("k", 500);
    rl.hit("k", 900);
    expect(rl.hit("k", 1_000).allowed).toBe(true);
  });

  it("les clés sont indépendantes", () => {
    const rl = new MemoryRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(rl.hit("a", 0).allowed).toBe(true);
    expect(rl.hit("b", 0).allowed).toBe(true);
    expect(rl.hit("a", 1).allowed).toBe(false);
  });

  it("purge les clés inactives", () => {
    const rl = new MemoryRateLimiter({ limit: 5, windowMs: 1_000 });
    rl.hit("a", 0);
    rl.hit("b", 0);
    rl.hit("c", 5_000);
    expect(rl.size).toBe(1);
  });
});
