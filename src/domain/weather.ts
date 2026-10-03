import { z } from "zod";

// Météo Open-Meteo (SPEC §7.9) : maille de 0,01°, conversions et lecture des réponses.
// Fonctions pures : l'accès réseau vit dans src/server/weather.

export interface Coordinates {
  lat: number;
  lon: number;
}

/** Maille de 0,01° (environ 1 km), coordonnées × 100 en entiers. */
export interface Cell {
  latE2: number;
  lonE2: number;
}

export interface WeatherDay {
  date: string;
  tMin: number | null;
  tMax: number | null;
  tMean: number | null;
  sunshineS: number | null;
  radiationMjM2: number | null;
}

export const roundCoord = (value: number) => Math.round(value * 100) / 100;

export const cellOf = ({ lat, lon }: Coordinates): Cell => ({
  latE2: Math.round(lat * 100),
  lonE2: Math.round(lon * 100),
});

export const cellCoordinates = ({ latE2, lonE2 }: Cell): Coordinates => ({
  lat: latE2 / 100,
  lon: lonE2 / 100,
});

/** Degrés-jours unifiés, base 18 °C. */
export const dju = (tMean: number | null, base = 18) =>
  tMean === null ? null : Math.max(0, base - tMean);

export const sunshineHours = (seconds: number | null) => (seconds === null ? null : seconds / 3600);

/** MJ/m² → kWh/m² (1 kWh = 3,6 MJ). */
export const radiationKwhM2 = (mj: number | null) => (mj === null ? null : mj / 3.6);

/** Variables quotidiennes demandées à Open-Meteo, dans l'ordre des colonnes. */
export const DAILY_VARIABLES = [
  "temperature_2m_min",
  "temperature_2m_max",
  "temperature_2m_mean",
  "sunshine_duration",
  "shortwave_radiation_sum",
] as const;

const series = z.array(z.number().nullable());
const dailyResponse = z
  .object({
    daily: z.object({
      time: z.array(z.iso.date()),
      temperature_2m_min: series,
      temperature_2m_max: series,
      temperature_2m_mean: series,
      sunshine_duration: series,
      shortwave_radiation_sum: series,
    }),
  })
  .refine((r) => DAILY_VARIABLES.every((v) => r.daily[v].length === r.daily.time.length), {
    message: "séries de longueurs différentes",
  });

/** Réponse forecast ou archive → jours ; les jours sans aucune valeur sont ignorés. */
export function parseOpenMeteoDaily(json: unknown): WeatherDay[] {
  const { daily } = dailyResponse.parse(json);
  return daily.time
    .map((date, i) => ({
      date,
      tMin: daily.temperature_2m_min[i] ?? null,
      tMax: daily.temperature_2m_max[i] ?? null,
      tMean: daily.temperature_2m_mean[i] ?? null,
      sunshineS: daily.sunshine_duration[i] ?? null,
      radiationMjM2: daily.shortwave_radiation_sum[i] ?? null,
    }))
    .filter((d) => [d.tMin, d.tMax, d.tMean, d.sunshineS, d.radiationMjM2].some((v) => v !== null));
}

export interface CommuneResult extends Coordinates {
  /** Nom suivi du département (admin2) ou de la région, ex. « Valence (Drôme) ». */
  label: string;
  country: string;
}

const geocodingResponse = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country_code: z.string().optional(),
        admin1: z.string().optional(),
        admin2: z.string().optional(),
      }),
    )
    .optional(),
});

/** Résultats de géocodage, communes françaises en tête, coordonnées arrondies. */
export function parseGeocoding(json: unknown): CommuneResult[] {
  const { results = [] } = geocodingResponse.parse(json);
  const mapped = results.map((r) => {
    const area = r.admin2 ?? r.admin1;
    return {
      label: area ? `${r.name} (${area})` : r.name,
      lat: roundCoord(r.latitude),
      lon: roundCoord(r.longitude),
      country: r.country_code ?? "",
    };
  });
  // Tri stable : l'ordre de pertinence d'Open-Meteo est conservé au sein de chaque groupe.
  return [...mapped.filter((r) => r.country === "FR"), ...mapped.filter((r) => r.country !== "FR")];
}
