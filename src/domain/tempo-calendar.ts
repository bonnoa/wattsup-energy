import { z } from "zod";
import type { TempoColor } from "./tariff/types";

// Calendrier Tempo (SPEC §7.8) : saisons du 1er septembre au 31 août, lecture des
// réponses de api-couleur-tempo.fr et du fichier d'amorçage. Fonctions pures.

export interface TempoDay {
  date: string;
  color: TempoColor;
}

const CODES: Record<number, TempoColor> = { 1: "bleu", 2: "blanc", 3: "rouge" };

/** Saison Tempo d'un jour, ex. "2025-2026" pour le 15 janvier 2026 ou le 1er septembre 2025. */
export function tempoSeasonOf(date: string): string {
  const year = Number(date.slice(0, 4));
  const start = date.slice(5) >= "09-01" ? year : year - 1;
  return `${start}-${start + 1}`;
}

/** Saisons couvrant les jours [from, to] inclus, dans l'ordre. */
export function seasonsBetween(from: string, to: string): string[] {
  const seasons: string[] = [];
  let start = Number(tempoSeasonOf(from).slice(0, 4));
  const last = Number(tempoSeasonOf(to).slice(0, 4));
  for (; start <= last; start++) seasons.push(`${start}-${start + 1}`);
  return seasons;
}

const communityDay = z.object({ dateJour: z.iso.date(), codeJour: z.number().int().min(0).max(3) });

/** Réponse de /api/joursTempo ou /api/jourTempo/… ; les jours non publiés (code 0) sont ignorés. */
export function parseCommunityDays(json: unknown): TempoDay[] {
  const days = z.union([z.array(communityDay), communityDay]).parse(json);
  return (Array.isArray(days) ? days : [days]).flatMap((d) => {
    const color = CODES[d.codeJour];
    return color ? [{ date: d.dateJour, color }] : [];
  });
}

const seedFile = z.object({
  days: z.record(z.iso.date(), z.enum(["bleu", "blanc", "rouge"])),
});

export function parseTempoSeed(json: unknown): TempoDay[] {
  return Object.entries(seedFile.parse(json).days).map(([date, color]) => ({ date, color }));
}
