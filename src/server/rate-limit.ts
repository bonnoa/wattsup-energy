// Limitation de débit de l'ingestion (SPEC §6.3) : 120 req/min par token.
// Implémentation en mémoire, valable pour une instance unique (V1). L'interface
// permet de brancher Redis ou Postgres sans toucher à la route.

export interface RateLimitResult {
  allowed: boolean;
  /** Secondes avant qu'une place se libère (présent si refusé). */
  retryAfterSec?: number;
}

export interface RateLimiter {
  hit(key: string, now?: number): RateLimitResult;
}

interface Options {
  limit: number;
  windowMs: number;
}

/** Fenêtre glissante exacte : horodatages des requêtes acceptées par clé. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(private readonly options: Options) {}

  get size(): number {
    return this.hits.size;
  }

  hit(key: string, now = Date.now()): RateLimitResult {
    const { limit, windowMs } = this.options;
    this.sweep(now);

    const since = now - windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      const oldest = recent[0] ?? now;
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true };
  }

  /** Supprime les clés sans requête dans la fenêtre (au plus une fois par fenêtre). */
  private sweep(now: number) {
    if (now - this.lastSweep < this.options.windowMs) return;
    this.lastSweep = now;
    const since = now - this.options.windowMs;
    for (const [key, times] of this.hits) {
      if ((times.at(-1) ?? 0) <= since) this.hits.delete(key);
    }
  }
}

export const ingestRateLimiter: RateLimiter = new MemoryRateLimiter({
  limit: 120,
  windowMs: 60_000,
});
