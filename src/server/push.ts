import { and, desc, eq } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/db";
import { household, pushSubscription, user } from "@/db/schema";
import { alertsPush, deviceLabel, type PushPayload } from "@/domain/push";
import { sendNewAlerts } from "./alerts";
import { householdContextFor, type HouseholdContext } from "./context";

// Notifications push (SPEC §9, T49) : abonnements par appareil et envoi par le protocole Web
// Push (clés VAPID). Désactivé tant que VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY ne sont pas
// renseignées : l'option n'apparaît pas dans Mon compte. Chaque opération filtre par foyer.

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  /** Contact transmis aux services push : `mailto:` ou adresse https de l'instance. */
  subject: string;
}

export function pushConfig(
  env: Record<string, string | undefined> = process.env,
): PushConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim() || env.BETTER_AUTH_URL?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export const pushConfigured = () => pushConfig() !== null;

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Abonne cet appareil (un appareil déjà connu passe au foyer qui s'abonne). */
export async function savePushSubscription(
  ctx: HouseholdContext,
  input: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  const values = { ...input, householdId: ctx.householdId, label: deviceLabel(userAgent) };
  await db
    .insert(pushSubscription)
    .values(values)
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: values });
}

export async function deletePushSubscription(
  ctx: HouseholdContext,
  endpoint: string,
): Promise<boolean> {
  const rows = await db
    .delete(pushSubscription)
    .where(
      and(
        eq(pushSubscription.endpoint, endpoint),
        eq(pushSubscription.householdId, ctx.householdId),
      ),
    )
    .returning({ id: pushSubscription.id });
  return rows.length > 0;
}

export async function listPushDevices(ctx: HouseholdContext) {
  return db
    .select({
      endpoint: pushSubscription.endpoint,
      label: pushSubscription.label,
      createdAt: pushSubscription.createdAt,
    })
    .from(pushSubscription)
    .where(eq(pushSubscription.householdId, ctx.householdId))
    .orderBy(desc(pushSubscription.createdAt));
}

/** Envoi vers un appareil ; lève une erreur avec `statusCode` si le service push refuse. */
export type PushSender = (subscription: PushSubscriptionInput, body: string) => Promise<void>;

const webPushSender =
  (config: PushConfig): PushSender =>
  async (s, body) => {
    await webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      body,
      {
        vapidDetails: config,
        TTL: 12 * 3600,
      },
    );
  };

/**
 * Envoie une notification à tous les appareils du foyer ; un abonnement expiré (404, 410) est
 * supprimé. Renvoie le nombre d'appareils atteints.
 */
export async function pushToHousehold(
  ctx: HouseholdContext,
  payload: PushPayload,
  send?: PushSender,
): Promise<number> {
  const config = pushConfig();
  const sender = send ?? (config ? webPushSender(config) : null);
  if (!sender) return 0;
  const subs = await db
    .select()
    .from(pushSubscription)
    .where(eq(pushSubscription.householdId, ctx.householdId));
  let delivered = 0;
  for (const s of subs) {
    try {
      await sender(s, JSON.stringify(payload));
      delivered += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.delete(pushSubscription).where(eq(pushSubscription.id, s.id));
      } else {
        console.error("[push] envoi impossible :", status ?? err);
      }
    }
  }
  return delivered;
}

/** Alertes nouvelles ou aggravées, sur les appareils abonnés du foyer. */
export async function pushAlerts(
  ctx: HouseholdContext,
  options: { now?: Date; send?: PushSender } = {},
): Promise<number> {
  return sendNewAlerts(
    ctx,
    "push",
    async (alerts) => {
      const payload = alertsPush(alerts);
      return payload !== null && (await pushToHousehold(ctx, payload, options.send)) > 0;
    },
    options.now,
  );
}

/** Tâche du planificateur : chaque foyer actif qui a au moins un appareil abonné. */
export async function pushAlertsForAll(): Promise<{ households: number; sent: number }> {
  if (!pushConfigured()) return { households: 0, sent: 0 };
  const rows = await db
    .selectDistinct({ ownerId: household.ownerId, disabledAt: user.disabledAt })
    .from(pushSubscription)
    .innerJoin(household, eq(household.id, pushSubscription.householdId))
    .innerJoin(user, eq(user.id, household.ownerId));
  const active = rows.filter((r) => !r.disabledAt);
  let sent = 0;
  for (const r of active) {
    try {
      sent += await pushAlerts(await householdContextFor(r.ownerId));
    } catch (err) {
      console.error("[push] alertes impossibles pour un foyer :", err);
    }
  }
  return { households: active.length, sent };
}
