import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { energyInterval, household, ingestLog } from "@/db/schema";
import { backfillRows, parseBackfill, type BackfillRejected } from "@/domain/ingest/backfill";
import { CSV_LIMITS, csvWindow } from "@/domain/ingest/csv";
import type { PayloadError } from "@/domain/ingest/schema";
import { localParts } from "@/lib/time";

// Historique envoyé à la demande par Home Assistant (SPEC §6.4). Ne remplace jamais une
// valeur déjà présente ; valeurs invraisemblables rejetées ; même quota que l'import CSV.
// Écriture et journal dans une seule transaction, comme un envoi ordinaire.

export interface BackfillSummary {
  inserted: number;
  /** Heures (ou jours) déjà présents : conservés tels quels. */
  existing: number;
  rejected: BackfillRejected;
  /** Quota de valeurs du foyer atteint : la fin de l'envoi n'est pas enregistrée. */
  quotaReached: boolean;
}

export type BackfillResponse =
  | { status: 200; body: { ok: true } & BackfillSummary }
  | { status: 400; body: { ok: false; errors: PayloadError[] } };

const HOUR_MS = 3_600_000;

export async function backfill(
  householdId: string,
  json: unknown,
  rawBody: string,
  now = new Date(),
): Promise<BackfillResponse> {
  const payloadSize = Buffer.byteLength(rawBody);
  const parsed = parseBackfill(json);
  if (!parsed.success) {
    await db.insert(ingestLog).values({
      householdId,
      httpStatus: 400,
      mode: "backfill",
      payloadSize,
      error: JSON.stringify(parsed.errors).slice(0, 2000),
    });
    return { status: 400, body: { ok: false, errors: parsed.errors } };
  }

  const [home] = await db
    .select({
      timezone: household.timezone,
      granularity: household.granularity,
      slugs: sql<
        string[]
      >`coalesce((select json_agg(c.slug) from category c where c.household_id = "household"."id"), '[]'::json)`,
      stored:
        sql<number>`(select count(*) from energy_interval e where e.household_id = "household"."id")`.mapWith(
          Number,
        ),
    })
    .from(household)
    .where(eq(household.id, householdId));
  if (!home) throw new Error(`foyer inconnu : ${householdId}`);

  const { rows, rejected } = backfillRows(parsed.data, {
    timezone: home.timezone,
    granularity: home.granularity,
    slugs: home.slugs,
    window: {
      from: csvWindow(localParts(now, home.timezone).date, home.timezone).from,
      // Heures terminées seulement.
      to: new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS),
    },
  });
  return db.transaction(async (tx) => {
    // Déjà présent : même compteur et même début, quel que soit le créneau (un jour reçu en
    // HP et HC ne doit pas recevoir en plus un total « jour entier »).
    let first = Infinity;
    let last = -Infinity;
    for (const r of rows) {
      first = Math.min(first, r.start.getTime());
      last = Math.max(last, r.start.getTime());
    }
    const present =
      rows.length > 0
        ? new Set(
            (
              await tx
                .select({ metric: energyInterval.metric, start: energyInterval.start })
                .from(energyInterval)
                .where(
                  and(
                    eq(energyInterval.householdId, householdId),
                    inArray(energyInterval.metric, [...new Set(rows.map((r) => r.metric))]),
                    gte(energyInterval.start, new Date(first)),
                    lte(energyInterval.start, new Date(last)),
                  ),
                )
            ).map((e) => `${e.metric}|${e.start.getTime()}`),
          )
        : new Set<string>();
    const fresh = rows.filter((r) => !present.has(`${r.metric}|${r.start.getTime()}`));
    const room = Math.max(0, CSV_LIMITS.householdRows - home.stored);
    const kept = fresh.slice(0, room);
    const written =
      kept.length > 0
        ? await tx
            .insert(energyInterval)
            .values(kept.map((r) => ({ ...r, householdId, source: "ha" as const })))
            .onConflictDoNothing()
            .returning({ id: energyInterval.householdId })
        : [];
    const summary: BackfillSummary = {
      inserted: written.length,
      existing: rows.length - fresh.length + (kept.length - written.length),
      rejected,
      quotaReached: kept.length < fresh.length,
    };
    await tx.insert(ingestLog).values({
      householdId,
      httpStatus: 200,
      mode: "backfill",
      payloadSize,
      warnings: [{ code: "backfill", ...summary }],
    });
    return { status: 200 as const, body: { ok: true as const, ...summary } };
  });
}
