import type { MailContent } from "@/domain/mail";
import type { FetchFn } from "./http";

// Envoi d'emails par l'API Resend (https://resend.com) : mot de passe oublié, nouvelle idée
// et messages de contact pour l'administrateur. Désactivé tant que RESEND_API_KEY et MAIL_FROM
// ne sont pas renseignés : le lien « Mot de passe oublié » et la page Contact n'apparaissent
// alors pas, et les idées sont enregistrées sans notification.

const RESEND_URL = "https://api.resend.com/emails";

export interface MailConfig {
  apiKey: string;
  /** Expéditeur, ex. « WattsUp Energy <noreply@exemple.fr> » (domaine vérifié dans Resend). */
  from: string;
}

export function mailConfig(
  env: Record<string, string | undefined> = process.env,
): MailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.MAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

export const mailConfigured = () => mailConfig() !== null;

/** Envoie un email ; lève une erreur si Resend refuse (le détail reste dans les logs). */
export async function sendMail(
  to: string,
  content: MailContent,
  config: MailConfig | null = mailConfig(),
  fetchFn: FetchFn = (url, init) => fetch(url, init),
): Promise<void> {
  if (!config) throw new Error("envoi d'emails non configuré (RESEND_API_KEY, MAIL_FROM)");
  const res = await fetchFn(RESEND_URL, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      to,
      from: config.from,
      subject: content.subject,
      text: content.text,
      html: content.html,
      ...(content.replyTo ? { reply_to: content.replyTo } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend : HTTP ${res.status}`);
}
