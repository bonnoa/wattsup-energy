import type { MailContent } from "@/domain/mail";
import type { FetchFn } from "./http";

// Envoi d'emails par l'API useSend (auto-hébergeable, https://usesend.com) : seul usage,
// le mot de passe oublié. Désactivé tant que USESEND_URL, USESEND_API_KEY et MAIL_FROM ne
// sont pas renseignés : le lien « Mot de passe oublié » n'apparaît alors pas.

export interface MailConfig {
  /** Adresse de l'instance useSend, ex. https://usesend.exemple.fr (sans /api). */
  url: string;
  apiKey: string;
  /** Expéditeur, ex. « WattsUp Energy <noreply@exemple.fr> » (domaine vérifié dans useSend). */
  from: string;
}

export function mailConfig(
  env: Record<string, string | undefined> = process.env,
): MailConfig | null {
  const url = env.USESEND_URL?.trim().replace(/\/+$/, "");
  const apiKey = env.USESEND_API_KEY?.trim();
  const from = env.MAIL_FROM?.trim();
  return url && apiKey && from ? { url, apiKey, from } : null;
}

export const mailConfigured = () => mailConfig() !== null;

/** Envoie un email ; lève une erreur si useSend refuse (le détail reste dans les logs). */
export async function sendMail(
  to: string,
  content: MailContent,
  config: MailConfig | null = mailConfig(),
  fetchFn: FetchFn = (url, init) => fetch(url, init),
): Promise<void> {
  if (!config)
    throw new Error("envoi d'emails non configuré (USESEND_URL, USESEND_API_KEY, MAIL_FROM)");
  const res = await fetchFn(`${config.url}/api/v1/emails`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ to, from: config.from, ...content }),
  });
  if (!res.ok) throw new Error(`useSend : HTTP ${res.status}`);
}
