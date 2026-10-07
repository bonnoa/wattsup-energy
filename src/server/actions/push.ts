"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getHouseholdContext } from "../context";
import { deletePushSubscription, pushToHousehold, savePushSubscription } from "../push";

const subscription = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Abonne l'appareil courant aux notifications (Mon compte). */
export async function subscribePushAction(raw: unknown): Promise<{ ok: boolean }> {
  const p = subscription.safeParse(raw);
  if (!p.success) return { ok: false };
  const ctx = await getHouseholdContext();
  await savePushSubscription(
    ctx,
    { endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth },
    (await headers()).get("user-agent"),
  );
  revalidatePath("/compte");
  return { ok: true };
}

/** Désabonne un appareil du foyer (celui-ci ou un autre de la liste). */
export async function unsubscribePushAction(endpoint: string): Promise<{ ok: boolean }> {
  if (typeof endpoint !== "string" || endpoint.length > 2000) return { ok: false };
  const ctx = await getHouseholdContext();
  const ok = await deletePushSubscription(ctx, endpoint);
  revalidatePath("/compte");
  return { ok };
}

/** Notification d'essai sur tous les appareils abonnés du foyer. */
export async function testPushAction(): Promise<{ delivered: number }> {
  const ctx = await getHouseholdContext();
  const delivered = await pushToHousehold(ctx, {
    title: "WattsUp Energy",
    body: "Les notifications fonctionnent sur cet appareil.",
    url: "/compte",
    tag: "wattsup-test",
  });
  return { delivered };
}
