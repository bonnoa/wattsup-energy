import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/v1/ingest/route";
import { addPurchase, listFuelEvents } from "@/server/fuel";
import { getLastPushAt } from "@/server/ingest/status";
import { createIngestToken } from "@/server/ingest/token";
import { updateProfile } from "@/server/profile";
import { createTestHousehold } from "../helpers/tenancy";

// Décompte d'un combustible depuis Home Assistant (SPEC §6.5).

async function setup(pellet: boolean) {
  const ctx = await createTestHousehold("fuel-event");
  await updateProfile(ctx, { ...ctx.profile, pellet });
  const { token } = await createIngestToken(ctx);
  const push = async (body: unknown) => {
    const res = await POST(
      new Request("http://localhost/api/v1/ingest", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  };
  return { ctx, push };
}

describe("décompte de combustible depuis HA", () => {
  it("un sac versé : consommation enregistrée, stock restant en réponse", async () => {
    const { ctx, push } = await setup(true);
    await addPurchase(ctx, {
      fuel: "pellet",
      qty: 10,
      unit: "bag",
      priceEur: 70,
      date: "2026-09-01",
    });
    const res = await push({ version: 1, fuel_event: { fuel: "pellet" } });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, stock: 9, unit: "sacs" });
    const events = await listFuelEvents(ctx);
    expect(events.at(-1)).toMatchObject({ type: "consumption", qty: 1, unit: "bag" });
    // Un décompte ne compte pas comme envoi d'énergie pour l'état de la liaison.
    expect(await getLastPushAt(ctx)).toBeNull();
  });

  it("granulés non activés : refus explicite ; forme invalide : 400", async () => {
    const { push } = await setup(false);
    const off = await push({ version: 1, fuel_event: { fuel: "pellet" } });
    expect(off.status).toBe(409);
    expect(String(off.json.error)).toContain("profil");
    const bad = await push({ version: 1, fuel_event: { fuel: "fioul" } });
    expect(bad.status).toBe(400);
  });
});
