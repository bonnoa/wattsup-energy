import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, energyInterval } from "@/db/schema";
import {
  CSV_LIMITS,
  csvRowKey,
  csvWindow,
  isCsvHeader,
  parseCsvLine,
  type CsvRow,
} from "@/domain/ingest/csv";
import { localParts } from "@/lib/time";
import type { HouseholdContext } from "../context";
import { MemoryRateLimiter } from "../rate-limit";

// Import CSV de l'historique (T22) : lecture en flux, ligne à ligne ; écriture par lots
// de 5 000 intervalles, chacun dans sa transaction. Un doublon CSV est remplacé ; une
// ligne déjà reçue de Home Assistant est conservée (HA fait foi).
//
// Garde-fous : un import à la fois et 10 par heure par foyer (mémoire du processus,
// instance unique en V1), dates des 10 dernières années, valeurs plausibles, quota de
// lignes par foyer.

const running = new Set<string>();
const importLimiter = new MemoryRateLimiter({
  limit: CSV_LIMITS.importsPerHour,
  windowMs: 3_600_000,
});

export type CsvSlot = { ok: true; release: () => void } | { ok: false; error: string };

/** Réserve l'import du foyer : refusé si un import tourne déjà ou après 10 dans l'heure. */
export function beginCsvImport(householdId: string, now = Date.now()): CsvSlot {
  if (running.has(householdId)) {
    return { ok: false, error: "un import est déjà en cours pour ce foyer" };
  }
  const hit = importLimiter.hit(householdId, now);
  if (!hit.allowed) {
    const minutes = Math.ceil((hit.retryAfterSec ?? 60) / 60);
    return {
      ok: false,
      error: `${CSV_LIMITS.importsPerHour} imports par heure au plus : réessayez dans ${minutes} min`,
    };
  }
  running.add(householdId);
  return { ok: true, release: () => running.delete(householdId) };
}

/** Détails de rejet conservés au plus (les compteurs, eux, sont complets). */
const MAX_ERRORS = 1000;

export interface CsvRejection {
  line: number;
  content: string;
  message: string;
}

export interface CsvReport {
  /** Lignes de données lues (en-tête et lignes vides exclues). */
  lines: number;
  imported: number;
  /** Lignes valides ignorées car l'intervalle vient déjà de Home Assistant. */
  keptHa: number;
  rejected: number;
  /** Lignes valides en double dans un même lot (la dernière l'emporte). */
  duplicates: number;
  errors: CsvRejection[];
  /** Raison d'un arrêt avant la fin du fichier (limite de taille ou de lignes). */
  stopped: string | null;
}

async function* lines(stream: ReadableStream<Uint8Array>, report: CsvReport) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > CSV_LIMITS.bytes) {
      report.stopped = "fichier de plus de 20 Mo : la suite n'est pas importée";
      await reader.cancel();
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    yield* parts;
  }
  buffer += decoder.decode();
  if (buffer) yield buffer;
}

async function flush(ctx: HouseholdContext, batch: Map<string, CsvRow>, report: CsvReport) {
  if (batch.size === 0) return;
  const rows = [...batch.values()].map((r) => ({
    householdId: ctx.householdId,
    metric: r.metric,
    start: r.start,
    granularity: r.granularity,
    tariffSlot: r.tariffSlot,
    kwh: r.kwh,
    source: "csv" as const,
  }));
  const written = await db.transaction((tx) =>
    tx
      .insert(energyInterval)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          energyInterval.householdId,
          energyInterval.metric,
          energyInterval.start,
          energyInterval.granularity,
          energyInterval.tariffSlot,
        ],
        set: { kwh: sql`excluded.kwh` },
        setWhere: sql`${energyInterval.source} = 'csv'`,
      })
      .returning({ metric: energyInterval.metric }),
  );
  report.imported += written.length;
  report.keptHa += rows.length - written.length;
  batch.clear();
}

export async function importCsv(
  ctx: HouseholdContext,
  stream: ReadableStream<Uint8Array>,
  onProgress?: (report: CsvReport) => void,
  options: { now?: Date; quota?: number } = {},
): Promise<CsvReport> {
  const now = options.now ?? new Date();
  const [slugRows, [stored]] = await Promise.all([
    db
      .select({ slug: category.slug })
      .from(category)
      .where(eq(category.householdId, ctx.householdId)),
    db
      .select({ rows: count() })
      .from(energyInterval)
      .where(eq(energyInterval.householdId, ctx.householdId)),
  ]);
  const today = localParts(now, ctx.timezone).date;
  const parseCtx = {
    timezone: ctx.timezone,
    granularity: ctx.granularity,
    slugs: slugRows.map((c) => c.slug),
    window: csvWindow(today, ctx.timezone),
  };
  // Lignes encore permises (prudent : un remplacement compte comme un ajout).
  const room = (options.quota ?? CSV_LIMITS.householdRows) - (stored?.rows ?? 0);
  const report: CsvReport = {
    lines: 0,
    imported: 0,
    keptHa: 0,
    rejected: 0,
    duplicates: 0,
    errors: [],
    stopped: null,
  };
  // Dernière valeur gagnante pour un même intervalle dans un lot (un upsert ne peut pas
  // toucher deux fois la même ligne).
  const batch = new Map<string, CsvRow>();
  let lineNo = 0;

  const quotaReached = () => {
    report.stopped = `quota de ${CSV_LIMITS.householdRows.toLocaleString("fr-FR")} valeurs par foyer atteint : la suite n'est pas importée`;
  };
  if (room <= 0) {
    quotaReached();
    return report;
  }

  for await (const raw of lines(stream, report)) {
    lineNo += 1;
    const line = raw.replace(/\r$/, "");
    if (line.trim() === "" || (lineNo === 1 && isCsvHeader(line))) continue;
    if (report.lines >= CSV_LIMITS.lines) {
      report.stopped = "limite de 500 000 lignes atteinte : la suite n'est pas importée";
      break;
    }
    report.lines += 1;
    const parsed = parseCsvLine(line, parseCtx);
    if (!parsed.ok) {
      report.rejected += 1;
      if (report.errors.length < MAX_ERRORS) {
        report.errors.push({ line: lineNo, content: line.slice(0, 200), message: parsed.error });
      }
      continue;
    }
    const key = csvRowKey(parsed.row);
    if (batch.has(key)) report.duplicates += 1;
    batch.set(key, parsed.row);
    if (report.imported + batch.size >= room) {
      await flush(ctx, batch, report);
      quotaReached();
      break;
    }
    if (batch.size >= CSV_LIMITS.batch) {
      await flush(ctx, batch, report);
      onProgress?.(report);
    }
  }
  await flush(ctx, batch, report);
  return report;
}
