// GET JSON vers les API publiques (Open-Meteo, Tempo) : timeout, nouvel essai sur erreur
// réseau ou 5xx avec backoff (0,5 s, 1 s…), jamais sur 4xx. fetch et la temporisation
// sont injectables pour les tests.

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface HttpOptions {
  fetchFn?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  retries?: number;
}

export interface HttpClient {
  getJson(url: string): Promise<unknown>;
}

export function httpClient(options: HttpOptions = {}): HttpClient {
  const fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retries = options.retries ?? 3;

  return {
    async getJson(url) {
      let lastError: unknown;
      for (let attempt = 0; attempt < retries; attempt++) {
        if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
        try {
          const res = await fetchFn(url, {
            signal: AbortSignal.timeout(timeoutMs),
            headers: { accept: "application/json" },
          });
          if (res.ok) return await res.json();
          lastError = new Error(`HTTP ${res.status} sur ${new URL(url).host}`);
          if (res.status < 500) break; // une erreur 4xx ne se corrige pas en réessayant
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    },
  };
}
