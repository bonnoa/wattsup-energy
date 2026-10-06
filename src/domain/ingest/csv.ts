import { addDays, zonedInstant } from "@/lib/time";
import { plausibleKwhPerHour } from "./hourly";
import { categorySlug } from "./schema";
import type { CoreMetric, Metric } from "./types";

// Import CSV de l'historique (SPEC §7.7, T22) : `timestamp,metric,kwh[,tariff_slot]`,
// valeurs en deltas. Analyse d'une ligne, pure ; une ligne invalide porte son motif.

export const CSV_LIMITS = {
  bytes: 20 * 1024 * 1024,
  lines: 500_000,
  batch: 5000,
  /** Profondeur d'historique acceptée, en années (jusqu'à demain). */
  yearsBack: 10,
  /** Intervalles stockés au plus par foyer (≈ 15 ans d'horaire sur une douzaine de compteurs). */
  householdRows: 2_000_000,
  /** Imports par heure et par foyer. */
  importsPerHour: 10,
} as const;

const CORE: readonly CoreMetric[] = [
  "grid_import",
  "grid_export",
  "solar_production",
  "battery_charge",
  "battery_charge_grid",
  "battery_discharge",
];

export interface CsvRow {
  metric: Metric;
  start: Date;
  granularity: "hour" | "day";
  tariffSlot: "all" | "hp" | "hc";
  kwh: number;
}

export interface CsvContext {
  timezone: string;
  granularity: "hourly" | "daily";
  /** Slugs des postes du foyer. */
  slugs: readonly string[];
  /** Instants acceptés [from, to) : pas d'historique trop ancien, rien dans le futur. */
  window: { from: Date; to: Date };
}

export type CsvLineResult = { ok: true; row: CsvRow } | { ok: false; error: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;
const KWH = /^\d+(?:\.\d+)?$/;

/** Instants acceptés : du 1er janvier d'il y a 10 ans à la fin d'aujourd'hui (jour local). */
export function csvWindow(today: string, timezone: string): CsvContext["window"] {
  return {
    from: zonedInstant(`${Number(today.slice(0, 4)) - CSV_LIMITS.yearsBack}-01-01`, 0, timezone),
    to: zonedInstant(addDays(today, 1), 0, timezone),
  };
}

export const isCsvHeader = (line: string) => /^\s*timestamp\s*,/i.test(line);

/** Clé d'unicité d'un intervalle (celle de la table energy_interval, hors foyer). */
export const csvRowKey = (r: CsvRow) =>
  `${r.metric}|${r.start.toISOString()}|${r.granularity}|${r.tariffSlot}`;

function parseMetric(raw: string, slugs: readonly string[]): Metric | string {
  if ((CORE as readonly string[]).includes(raw)) return raw as CoreMetric;
  if (raw.startsWith("category:")) {
    const slug = raw.slice("category:".length);
    if (!categorySlug.safeParse(slug).success || !slugs.includes(slug)) {
      return `poste inconnu « ${slug} » : créez-le dans Réglages`;
    }
    return raw as Metric;
  }
  return `métrique inconnue « ${raw} »`;
}

export function parseCsvLine(line: string, ctx: CsvContext): CsvLineResult {
  const cols = line.split(",").map((c) => c.trim());
  if (cols.length < 3 || cols.length > 4) {
    return { ok: false, error: "3 ou 4 colonnes attendues : timestamp,metric,kwh[,tariff_slot]" };
  }
  const [timestamp = "", rawMetric = "", rawKwh = "", rawSlot] = cols;

  const isDay = DATE.test(timestamp);
  const local = LOCAL.exec(timestamp);
  let start: Date;
  if (isDay) {
    start = zonedInstant(timestamp, 0, ctx.timezone);
  } else if (ZONED.test(timestamp)) {
    start = new Date(timestamp);
  } else if (local) {
    const [, date = "", hh = "0", mm = "0", ss = "0"] = local;
    start = new Date(
      zonedInstant(date, Number(hh), ctx.timezone).getTime() +
        (Number(mm) * 60 + Number(ss)) * 1000,
    );
  } else {
    return { ok: false, error: "horodatage ISO 8601 invalide" };
  }
  if (Number.isNaN(start.getTime())) return { ok: false, error: "horodatage ISO 8601 invalide" };

  if (isDay && ctx.granularity === "hourly") {
    return { ok: false, error: "ce foyer reçoit des données horaires : ligne quotidienne refusée" };
  }
  if (!isDay && ctx.granularity === "daily") {
    return { ok: false, error: "ce foyer reçoit des données quotidiennes : ligne horaire refusée" };
  }
  if (!isDay && start.getTime() % 3_600_000 !== 0) {
    return { ok: false, error: "une ligne horaire commence à une heure pile" };
  }
  if (start < ctx.window.from || start >= ctx.window.to) {
    return {
      ok: false,
      error: `date hors de la plage acceptée (depuis ${ctx.window.from.getUTCFullYear()}, jusqu'à aujourd'hui)`,
    };
  }

  const metric = parseMetric(rawMetric, ctx.slugs);
  if (!(CORE as readonly string[]).includes(metric) && !metric.startsWith("category:")) {
    return { ok: false, error: metric };
  }

  // « 1,5 » coupe la valeur en deux colonnes : virgule décimale à la place du point.
  if (!KWH.test(rawKwh) || (rawSlot !== undefined && /^\d+$/.test(rawSlot))) {
    return { ok: false, error: "kWh positif attendu (point décimal)" };
  }
  const kwh = Number(rawKwh);
  const cap = plausibleKwhPerHour(metric) * (isDay ? 24 : 1);
  if (kwh > cap) {
    return {
      ok: false,
      error: `valeur invraisemblable : plus de ${cap} kWh ${isDay ? "en un jour" : "en une heure"}`,
    };
  }

  let tariffSlot: CsvRow["tariffSlot"] = "all";
  if (rawSlot !== undefined && rawSlot !== "") {
    if (!isDay) return { ok: false, error: "tariff_slot réservé aux lignes quotidiennes" };
    if (rawSlot !== "hp" && rawSlot !== "hc") {
      return { ok: false, error: "tariff_slot attendu : hp ou hc" };
    }
    if (metric !== "grid_import") {
      return { ok: false, error: "tariff_slot (hp ou hc) réservé à grid_import" };
    }
    tariffSlot = rawSlot;
  }

  return {
    ok: true,
    row: { metric: metric as Metric, start, granularity: isDay ? "day" : "hour", tariffSlot, kwh },
  };
}
