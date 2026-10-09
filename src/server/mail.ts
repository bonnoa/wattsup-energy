import type { MailContent } from "@/domain/mail";
import type { FetchFn } from "./http";

// Envoi d'emails par l'API Brevo (https://www.brevo.com) ou, à défaut, par l'API Resend
// (https://resend.com) : mot de passe oublié, confirmation d'adresse, alertes, nouvelle idée
// et messages de contact pour l'administrateur. Désactivé tant que MAIL_FROM et une clé
// (BREVO_API_KEY, sinon RESEND_API_KEY) ne sont pas renseignés : le lien « Mot de passe
// oublié » et la page Contact n'apparaissent alors pas, et les idées sont enregistrées sans
// notification.

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const RESEND_URL = "https://api.resend.com/emails";

export interface MailConfig {
  provider: "brevo" | "resend";
  apiKey: string;
  /** Expéditeur, ex. « WattsUp Energy <noreply@exemple.fr> » (domaine vérifié chez le prestataire). */
  from: string;
}

export function mailConfig(
  env: Record<string, string | undefined> = process.env,
): MailConfig | null {
  const from = env.MAIL_FROM?.trim();
  if (!from) return null;
  const brevo = env.BREVO_API_KEY?.trim();
  if (brevo) return { provider: "brevo", apiKey: brevo, from };
  const resend = env.RESEND_API_KEY?.trim();
  return resend ? { provider: "resend", apiKey: resend, from } : null;
}

export const mailConfigured = () => mailConfig() !== null;

/** « Nom <adresse> » ou « adresse » → expéditeur Brevo. */
function brevoSender(from: string): { name?: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (!m) return { email: from };
  const name = (m[1] ?? "").replace(/^"|"$/g, "").trim();
  return name ? { name, email: (m[2] ?? "").trim() } : { email: (m[2] ?? "").trim() };
}

function request(
  to: string,
  content: MailContent,
  config: MailConfig,
): { url: string; headers: Record<string, string>; body: object } {
  if (config.provider === "brevo") {
    return {
      url: BREVO_URL,
      headers: {
        "api-key": config.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: {
        sender: brevoSender(config.from),
        to: [{ email: to }],
        subject: content.subject,
        textContent: content.text,
        htmlContent: content.html,
        ...(content.replyTo ? { replyTo: { email: content.replyTo } } : {}),
      },
    };
  }
  return {
    url: RESEND_URL,
    headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
    body: {
      to,
      from: config.from,
      subject: content.subject,
      text: content.text,
      html: content.html,
      ...(content.replyTo ? { reply_to: content.replyTo } : {}),
    },
  };
}

/** Envoie un email ; lève une erreur si le prestataire refuse (le détail reste dans les logs). */
export async function sendMail(
  to: string,
  content: MailContent,
  config: MailConfig | null = mailConfig(),
  fetchFn: FetchFn = (url, init) => fetch(url, init),
): Promise<void> {
  if (!config) {
    throw new Error("envoi d'emails non configuré (MAIL_FROM, BREVO_API_KEY ou RESEND_API_KEY)");
  }
  const r = request(to, content, config);
  const res = await fetchFn(r.url, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: r.headers,
    body: JSON.stringify(r.body),
  });
  if (!res.ok)
    throw new Error(`${config.provider === "brevo" ? "Brevo" : "Resend"} : HTTP ${res.status}`);
}
