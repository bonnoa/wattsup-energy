import { parseCommunityDays, type TempoDay } from "@/domain/tempo-calendar";
import { httpClient, type HttpClient, type HttpOptions } from "../http";

// Source communautaire api-couleur-tempo.fr (SPEC §7.8), sans authentification. Aucune
// donnée utilisateur n'est envoyée : les appels ne portent que sur des saisons.

export interface TempoSource {
  /** Jours publiés d'une saison "AAAA-AAAA" (du 1er septembre au 31 août). */
  season(season: string): Promise<TempoDay[]>;
}

const BASE = "https://www.api-couleur-tempo.fr/api";

export class CommunityTempoSource implements TempoSource {
  private readonly http: HttpClient;

  constructor(options: HttpOptions = {}) {
    this.http = httpClient(options);
  }

  async season(season: string): Promise<TempoDay[]> {
    if (!/^\d{4}-\d{4}$/.test(season)) throw new Error(`saison invalide : ${season}`);
    return parseCommunityDays(await this.http.getJson(`${BASE}/joursTempo?periode=${season}`));
  }
}
