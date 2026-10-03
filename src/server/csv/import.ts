import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, energyInterval } from "@/db/schema";
import { CSV_LIMITS, csvRowKey, isCsvHeader, parseCsvLine, type CsvRow } from "@/domain/ingest/csv";
import type { HouseholdContext } from "../context";

// Import CSV de l'historique (T22) : lecture en flux, ligne à ligne ; écriture par lots
// de 5 000 intervalles, chacun dans sa transaction. Un doublon CSV est remplacé ; une
// ligne déjà reçue de Home Assistant est conservée (HA fait foi).

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
): Promise<CsvReport> {
  const slugs = (
    await db
      .select({ slug: category.slug })
      .from(category)
      .where(eq(category.householdId, ctx.householdId))
  ).map((c) => c.slug);
  const parseCtx = { timezone: ctx.timezone, granularity: ctx.granularity, slugs };
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
    if (batch.size >= CSV_LIMITS.batch) {
      await flush(ctx, batch, report);
      onProgress?.(report);
    }
  }
  await flush(ctx, batch, report);
  return report;
}
