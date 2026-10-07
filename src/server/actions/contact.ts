"use server";

import { parseContactInput } from "@/domain/contact";
import { APP_VERSION } from "@/lib/version";
import { ContactError, sendContactMessage } from "../contact";
import { getHouseholdContext } from "../context";
import { mailConfigured } from "../mail";
import { MemoryRateLimiter } from "../rate-limit";

export type ContactActionResult = { ok: true } | { ok: false; errors: string[] };

/** 5 messages par heure et par compte. */
const contactLimiter = new MemoryRateLimiter({ limit: 5, windowMs: 3_600_000 });

export async function sendContactAction(raw: {
  kind: unknown;
  message: unknown;
}): Promise<ContactActionResult> {
  const parsed = parseContactInput(raw);
  if (!parsed.ok) return parsed;
  if (!mailConfigured()) {
    return { ok: false, errors: ["L'envoi de messages n'est pas configuré sur cette instance."] };
  }
  const ctx = await getHouseholdContext();
  const limit = contactLimiter.hit(ctx.userId);
  if (!limit.allowed) {
    return {
      ok: false,
      errors: [
        `5 messages envoyés dans l'heure : réessayez dans ${Math.ceil((limit.retryAfterSec ?? 60) / 60)} min.`,
      ],
    };
  }
  try {
    await sendContactMessage(ctx, parsed.value, { version: APP_VERSION });
    return { ok: true };
  } catch (err) {
    if (err instanceof ContactError) return { ok: false, errors: [err.message] };
    console.error("[contact] message non envoyé :", err);
    return { ok: false, errors: ["Envoi impossible pour le moment. Réessayez plus tard."] };
  }
}
