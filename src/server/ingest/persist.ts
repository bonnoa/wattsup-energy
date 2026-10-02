import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  category,
  energyInterval,
  household,
  ingestLog,
  meterState,
  tempoOverride,
  weatherDaily,
} from "@/db/schema";
import { indexToIntervals, type MeterReading } from "@/domain/ingest/hourly";
import { dailyToIntervals, hourlyReadings } from "@/domain/ingest/normalize";
import {
  parseIngestPayload,
  type DailyPayload,
  type HourlyPayload,
  type PayloadError,
} from "@/domain/ingest/schema";
import type { IngestWarning } from "@/domain/ingest/types";
import { localParts, tempoDay, zonedInstant } from "@/lib/time";

// Persistance d'un push HA (SPEC §6). Tout est écrit dans une transaction : un push
// est appliqué entièrement ou pas du tout.

export type IngestResponse =
  | { status: 200; body: { ok: true; warnings: IngestWarning[] } }
  | { status: 400; body: { ok: false; errors: PayloadError[] } };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const intervalKey = [
  energyInterval.householdId,
  energyInterval.metric,
  energyInterval.start,
  energyInterval.granularity,
  energyInterval.tariffSlot,
];

export async function ingest(householdId: string, rawBody: string): Promise<IngestResponse> {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return log(householdId, rawBody, null, {
      status: 400,
      body: { ok: false, errors: [{ path: "", message: "JSON invalide" }] },
    });
  }

  const parsed = parseIngestPayload(json);
  if (!parsed.success) {
    return log(householdId, rawBody, null, {
      status: 400,
      body: { ok: false, errors: parsed.errors },
    });
  }

  const payload = parsed.data;
  const [home] = await db
    .select({ timezone: household.timezone })
    .from(household)
    .where(eq(household.id, householdId));
  if (!home) throw new Error(`foyer inconnu : ${householdId}`);
  const slugs = (
    await db
      .select({ slug: category.slug })
      .from(category)
      .where(eq(category.householdId, householdId))
  ).map((c) => c.slug);

  const warnings = await db.transaction((tx) =>
    payload.kind === "hourly"
      ? persistHourly(tx, householdId, home.timezone, payload, slugs)
      : persistDaily(tx, householdId, home.timezone, payload, slugs),
  );
  if (payload.fuel) warnings.push({ code: "ignored_block", key: "fuel" });

  return log(householdId, rawBody, payload.kind, { status: 200, body: { ok: true, warnings } });
}

async function persistHourly(
  tx: Tx,
  householdId: string,
  timezone: string,
  payload: HourlyPayload,
  slugs: string[],
): Promise<IngestWarning[]> {
  const { readings, warnings } = hourlyReadings(payload, slugs);

  for (const reading of readings) {
    const [prev] = await tx
      .select()
      .from(meterState)
      .where(and(eq(meterState.householdId, householdId), eq(meterState.metric, reading.metric)))
      .for("update");
    const previous: MeterReading | undefined = prev
      ? { metric: reading.metric, ts: prev.ts, value: prev.value }
      : undefined;

    const result = indexToIntervals(previous, reading);
    warnings.push(...result.warnings);

    if (result.intervals.length > 0) {
      await tx
        .insert(energyInterval)
        .values(
          result.intervals.map((i) => ({
            householdId,
            metric: i.metric,
            start: i.start,
            granularity: "hour" as const,
            kwh: i.kwh,
            source: "ha" as const,
          })),
        )
        .onConflictDoUpdate({
          target: intervalKey,
          // Une heure peut recevoir plusieurs parts (pushes décalés) : on cumule.
          // Une heure importée par CSV est remplacée : HA fait foi.
          set: {
            kwh: sql`case when ${energyInterval.source} = 'csv' then excluded.kwh else ${energyInterval.kwh} + excluded.kwh end`,
            source: sql`'ha'`,
          },
        });
    }

    const rejected = result.warnings.some(
      (w) => w.code === "invalid_value" || w.code === "out_of_order",
    );
    if (!rejected) {
      await tx
        .insert(meterState)
        .values({ householdId, metric: reading.metric, ts: reading.ts, value: reading.value })
        .onConflictDoUpdate({
          target: [meterState.householdId, meterState.metric],
          set: { ts: reading.ts, value: reading.value },
        });
    }
  }

  const temp = payload.weather?.outdoor_temp_c;
  if (temp !== undefined) {
    const day = localParts(payload.ts, timezone).date;
    await tx
      .insert(weatherDaily)
      .values({ householdId, date: day, tMin: temp, tMax: temp, tSum: temp, tCount: 1 })
      .onConflictDoUpdate({
        target: [weatherDaily.householdId, weatherDaily.date],
        set: {
          tMin: sql`least(${weatherDaily.tMin}, excluded.t_min)`,
          tMax: sql`greatest(${weatherDaily.tMax}, excluded.t_max)`,
          tSum: sql`${weatherDaily.tSum} + excluded.t_sum`,
          tCount: sql`${weatherDaily.tCount} + 1`,
        },
      });
  }

  if (payload.tempo_color) {
    await upsertTempo(tx, householdId, tempoDay(payload.ts, timezone), payload.tempo_color);
  }

  return warnings;
}

async function persistDaily(
  tx: Tx,
  householdId: string,
  timezone: string,
  payload: DailyPayload,
  slugs: string[],
): Promise<IngestWarning[]> {
  const { intervals, warnings } = dailyToIntervals(payload, slugs);
  const start = zonedInstant(payload.date, 0, timezone);

  if (intervals.length > 0) {
    await tx
      .insert(energyInterval)
      .values(
        intervals.map((i) => ({
          householdId,
          metric: i.metric,
          start,
          granularity: "day" as const,
          tariffSlot: i.slot ?? ("all" as const),
          kwh: i.kwh,
          source: "ha" as const,
        })),
      )
      // Idempotent : renvoyer la même date remplace les valeurs.
      .onConflictDoUpdate({
        target: intervalKey,
        set: { kwh: sql`excluded.kwh`, source: sql`'ha'` },
      });
  }

  const w = payload.weather;
  if (w) {
    const values = { tMin: w.t_min, tMax: w.t_max, tSum: w.t_avg, tCount: 1 };
    await tx
      .insert(weatherDaily)
      .values({ householdId, date: payload.date, ...values })
      .onConflictDoUpdate({ target: [weatherDaily.householdId, weatherDaily.date], set: values });
  }

  if (payload.tempo_color) {
    await upsertTempo(tx, householdId, payload.date, payload.tempo_color);
  }

  return warnings;
}

async function upsertTempo(
  tx: Tx,
  householdId: string,
  date: string,
  color: "bleu" | "blanc" | "rouge",
) {
  await tx
    .insert(tempoOverride)
    .values({ householdId, date, color, source: "ha" })
    .onConflictDoUpdate({
      target: [tempoOverride.householdId, tempoOverride.date],
      set: { color },
      // Une correction manuelle prime sur la couleur poussée par HA.
      setWhere: sql`${tempoOverride.source} = 'ha'`,
    });
}

async function log<R extends IngestResponse>(
  householdId: string,
  rawBody: string,
  mode: "hourly" | "daily" | null,
  response: R,
): Promise<R> {
  await db.insert(ingestLog).values({
    householdId,
    httpStatus: response.status,
    mode,
    payloadSize: Buffer.byteLength(rawBody),
    warnings: response.body.ok ? response.body.warnings : [],
    error: response.body.ok ? null : JSON.stringify(response.body.errors).slice(0, 2000),
  });
  return response;
}
