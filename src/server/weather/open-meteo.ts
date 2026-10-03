import {
  cellCoordinates,
  DAILY_VARIABLES,
  parseGeocoding,
  parseOpenMeteoDaily,
  type Cell,
  type CommuneResult,
  type WeatherDay,
} from "@/domain/weather";

// Client Open-Meteo (SPEC §7.9) : gratuit en usage non commercial, sans clé. Seules
// les coordonnées arrondies de la maille sont envoyées, jamais d'identifiant.

export interface WeatherSource {
  /** Les `pastDays` derniers jours et aujourd'hui (modèle de prévision). */
  forecast(cell: Cell, pastDays: number): Promise<WeatherDay[]>;
  /** Réanalyse ERA5, jours [from, to] inclus. */
  archive(cell: Cell, from: string, to: string): Promise<WeatherDay[]>;
  searchCommunes(query: string): Promise<CommuneResult[]>;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

interface Options {
  fetchFn?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  retries?: number;
}

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

export class OpenMeteoSource implements WeatherSource {
  private readonly fetchFn: FetchFn;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(options: Options = {}) {
    this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retries = options.retries ?? 3;
  }

  async forecast(cell: Cell, pastDays: number): Promise<WeatherDay[]> {
    const url = this.dailyUrl(FORECAST_URL, cell, {
      past_days: String(pastDays),
      forecast_days: "1",
    });
    return parseOpenMeteoDaily(await this.getJson(url));
  }

  async archive(cell: Cell, from: string, to: string): Promise<WeatherDay[]> {
    const url = this.dailyUrl(ARCHIVE_URL, cell, { start_date: from, end_date: to });
    return parseOpenMeteoDaily(await this.getJson(url));
  }

  async searchCommunes(query: string): Promise<CommuneResult[]> {
    const params = new URLSearchParams({ name: query, count: "8", language: "fr", format: "json" });
    return parseGeocoding(await this.getJson(`${GEOCODING_URL}?${params}`));
  }

  private dailyUrl(base: string, cell: Cell, extra: Record<string, string>): string {
    const { lat, lon } = cellCoordinates(cell);
    const params = new URLSearchParams({
      latitude: lat.toFixed(2),
      longitude: lon.toFixed(2),
      daily: DAILY_VARIABLES.join(","),
      timezone: "Europe/Paris",
      ...extra,
    });
    return `${base}?${params}`;
  }

  /** GET JSON avec timeout ; nouvel essai sur erreur réseau ou 5xx (backoff 0,5 s, 1 s…). */
  private async getJson(url: string): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.retries; attempt++) {
      if (attempt > 0) await this.sleep(500 * 2 ** (attempt - 1));
      try {
        const res = await this.fetchFn(url, { signal: AbortSignal.timeout(this.timeoutMs) });
        if (res.ok) return await res.json();
        lastError = new Error(`Open-Meteo HTTP ${res.status}`);
        if (res.status < 500) break; // une erreur 4xx ne se corrige pas en réessayant
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
