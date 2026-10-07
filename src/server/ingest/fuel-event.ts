import { eq } from "drizzle-orm";
import { db } from "@/db";
import { household, ingestLog } from "@/db/schema";
import { parseFuelEvent } from "@/domain/ingest/fuel-event";
import type { PayloadError } from "@/domain/ingest/schema";
import { householdContextFor } from "../context";
import { addQuickConsumption, fuelStock } from "../fuel";

// Décompte d'un combustible envoyé par Home Assistant (SPEC §6.5) : une consommation
// horodatée maintenant, comme le bouton « Sac versé » de l'appli ; la réponse donne le
// stock restant (pour une notification côté HA).

export type FuelEventResponse =
  | {
      status: 200;
      body: { ok: true; id: string; stock: number; unit: "sacs" | "stères" };
    }
  | { status: 400; body: { ok: false; errors: PayloadError[] } }
  | { status: 409; body: { ok: false; error: string } };

const LABEL = { pellet: "granulés", wood: "bois" } as const;

export async function fuelEvent(
  householdId: string,
  json: unknown,
  rawBody: string,
  now = new Date(),
): Promise<FuelEventResponse> {
  const payloadSize = Buffer.byteLength(rawBody);
  const fail = async (response: Exclude<FuelEventResponse, { status: 200 }>) => {
    await db.insert(ingestLog).values({
      householdId,
      httpStatus: response.status,
      mode: "fuel",
      payloadSize,
      error: ("errors" in response.body
        ? JSON.stringify(response.body.errors)
        : response.body.error
      ).slice(0, 2000),
    });
    return response;
  };

  const parsed = parseFuelEvent(json);
  if (!parsed.success) return fail({ status: 400, body: { ok: false, errors: parsed.errors } });
  const { fuel, qty } = parsed.data;

  const [home] = await db
    .select({ ownerId: household.ownerId })
    .from(household)
    .where(eq(household.id, householdId));
  if (!home) throw new Error(`foyer inconnu : ${householdId}`);
  const ctx = await householdContextFor(home.ownerId);
  if (!ctx.profile[fuel]) {
    return fail({
      status: 409,
      body: {
        ok: false,
        error: `le ${fuel === "pellet" ? "chauffage aux granulés" : "chauffage au bois"} n'est pas activé dans le profil du foyer (Réglages › Profil)`,
      },
    });
  }

  const event = await addQuickConsumption(ctx, fuel, now, qty);
  if (!event) throw new Error("décompte non enregistré");
  const base = await fuelStock(ctx, fuel, now);
  const stock =
    fuel === "pellet"
      ? Math.round((base / ctx.settings.pelletBagKg) * 10) / 10
      : Math.round(base * 10) / 10;
  const unit = fuel === "pellet" ? ("sacs" as const) : ("stères" as const);
  await db.insert(ingestLog).values({
    householdId,
    httpStatus: 200,
    mode: "fuel",
    payloadSize,
    warnings: [{ code: "fuel_event", fuel: LABEL[fuel], qty, stock, unit }],
  });
  return { status: 200, body: { ok: true, id: event.id, stock, unit } };
}
