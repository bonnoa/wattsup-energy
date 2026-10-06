import { z } from "zod";
import { addDays, localParts, zonedInstant } from "@/lib/time";
import { plausibleKwhPerHour } from "./hourly";
import { categorySlug } from "./schema";
import type { Metric } from "./types";

// Historique envoyé à la demande par Home Assistant (SPEC §6.4) : les statistiques
// horaires du recorder (`recorder.get_statistics`, type `change`, unités en kWh), avec la
// correspondance compteur → capteur de l'automatisation. Bloc `backfill` du contrat v1,
// additionnel : un envoi ordinaire est inchangé. Pur.

const CORE = [
  "grid_import",
  "grid_export",
  "solar_production",
  "battery_charge",
  "battery_charge_grid",
  "battery_discharge",
] as const;

const metricKey = z.union([z.enum(CORE), z.templateLiteral(["category:", categorySlug])]);

const point = z.object({
  start: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  change: z.number().nullable().optional(),
});

const backfillSchema = z.object({
  version: z.literal(1),
  backfill: z.object({
    /** Compteur WattsUp → capteur HA (statistic_id). */
    metrics: z.record(metricKey, z.string().min(1).max(255)),
    /** Réponse de recorder.get_statistics : capteur → heures. */
    statistics: z.record(z.string().max(255), z.array(point).max(10_000)).default({}),
  }),
});

export type BackfillPayload = z.output<typeof backfillSchema>;

/** Un envoi porte-t-il un bloc d'historique ? (aiguillage avant l'analyse complète) */
export const isBackfill = (json: unknown): boolean =>
  typeof json === "object" && json !== null && "backfill" in json;

export function parseBackfill(json: unknown) {
  const r = backfillSchema.safeParse(json);
  return r.success
    ? { success: true as const, data: r.data }
    : {
        success: false as const,
        errors: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      };
}

export interface BackfillRow {
  metric: Metric;
  start: Date;
  granularity: "hour" | "day";
  tariffSlot: "all";
  kwh: number;
}

export interface BackfillRejected {
  /** Au-delà du seuil de plausibilité du compteur (ex. un saut aberrant des statistiques). */
  implausible: number;
  /** Variation négative (compteur remis à zéro). */
  negative: number;
  /** Hors de la plage acceptée, ou heure / jour pas encore terminé. */
  outOfRange: number;
  /** Poste absent de WattsUp. */
  unknownCategory: number;
}

export interface BackfillContext {
  timezone: string;
  granularity: "hourly" | "daily";
  slugs: readonly string[];
  /** Instants acceptés [from, to) ; `to` : maintenant (seules les heures terminées). */
  window: { from: Date; to: Date };
}

const HOUR_MS = 3_600_000;

/**
 * Lignes à insérer : une par heure (foyer horaire) ou par jour local (foyer quotidien,
 * heures additionnées, jour terminé seulement). Les valeurs absentes sont ignorées.
 */
export function backfillRows(
  payload: BackfillPayload,
  ctx: BackfillContext,
): { rows: BackfillRow[]; rejected: BackfillRejected } {
  const rejected: BackfillRejected = {
    implausible: 0,
    negative: 0,
    outOfRange: 0,
    unknownCategory: 0,
  };
  const hourly: BackfillRow[] = [];
  for (const [metric, entity] of Object.entries(payload.backfill.metrics)) {
    const points = payload.backfill.statistics[entity] ?? [];
    const slug = metric.startsWith("category:") ? metric.slice("category:".length) : null;
    for (const p of points) {
      if (p.change === null || p.change === undefined) continue;
      if (slug !== null && !ctx.slugs.includes(slug)) {
        rejected.unknownCategory += 1;
        continue;
      }
      const start = p.start;
      const end =
        ctx.granularity === "hourly"
          ? new Date(start.getTime() + HOUR_MS)
          : zonedInstant(addDays(localParts(start, ctx.timezone).date, 1), 0, ctx.timezone);
      if (start.getTime() % HOUR_MS !== 0 || start < ctx.window.from || end > ctx.window.to) {
        rejected.outOfRange += 1;
      } else if (p.change < 0) {
        rejected.negative += 1;
      } else if (p.change > plausibleKwhPerHour(metric)) {
        rejected.implausible += 1;
      } else {
        hourly.push({
          metric: metric as Metric,
          start,
          granularity: "hour",
          tariffSlot: "all",
          kwh: p.change,
        });
      }
    }
  }
  if (ctx.granularity === "hourly") return { rows: hourly, rejected };

  // Foyer quotidien : total de chaque jour local.
  const days = new Map<string, BackfillRow>();
  for (const r of hourly) {
    const day = localParts(r.start, ctx.timezone).date;
    const key = `${r.metric}|${day}`;
    const row = days.get(key) ?? {
      metric: r.metric,
      start: zonedInstant(day, 0, ctx.timezone),
      granularity: "day" as const,
      tariffSlot: "all" as const,
      kwh: 0,
    };
    row.kwh += r.kwh;
    days.set(key, row);
  }
  return { rows: [...days.values()], rejected };
}
