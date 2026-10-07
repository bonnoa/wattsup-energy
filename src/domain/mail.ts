// Emails envoyés par l'instance (SPEC §14) : contenu, texte et HTML. Pur.

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Lien de réinitialisation du mot de passe (valable une heure). */
export function resetPasswordEmail(name: string, url: string): MailContent {
  const hello = name ? `Bonjour ${name},` : "Bonjour,";
  const text = [
    hello,
    "",
    "Vous avez demandé à changer le mot de passe de votre compte WattsUp Energy.",
    "Ouvrez ce lien pour en choisir un nouveau (il est valable une heure) :",
    url,
    "",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.",
  ].join("\n");
  const html = `<!doctype html><html lang="fr"><body style="font-family:system-ui,sans-serif;color:#16181a;background:#f4f2ec;padding:24px">
<div style="max-width:480px;margin:auto;background:#fff;border:1px solid #e4e0d6;border-radius:14px;padding:24px">
<p>${escapeHtml(hello)}</p>
<p>Vous avez demandé à changer le mot de passe de votre compte WattsUp Energy.</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#16181a;color:#f4f2ec;padding:10px 16px;border-radius:8px;text-decoration:none">Choisir un nouveau mot de passe</a></p>
<p style="font-size:13px;color:#6b6f68">Le lien est valable une heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.</p>
</div></body></html>`;
  return { subject: "WattsUp Energy : nouveau mot de passe", text, html };
}
