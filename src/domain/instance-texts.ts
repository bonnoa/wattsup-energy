// Textes propres à l'instance (T53), réglés par l'administrateur dans Administration ›
// Paramètres : intitulé de l'entrée Contact du menu (repris en titre de la page et du
// formulaire), phrase d'introduction de la page et texte affiché sous le bouton de soutien.
// Sans réglage : textes neutres, pour qu'une instance installée depuis GitHub ne parle pas
// au nom de l'instance de référence. Pur.

export const DEFAULT_CONTACT_LABEL = "Contact";
export const DEFAULT_CONTACT_INTRO =
  "Une question, une remarque ou un bug : écrivez à l'administrateur de WattsUp.";
export const DEFAULT_FORM_TITLE = "Écrire à l'administrateur";
export const CONTACT_LABEL_MAX = 40;
export const CONTACT_INTRO_MAX = 200;
export const CONTACT_NOTICE_MAX = 4000;

export interface ContactTexts {
  label: string;
  intro: string;
  formTitle: string;
  notice: string | null;
}

/** Réglage enregistré → textes affichés. */
export function resolveContactTexts(
  saved: {
    contactLabel: string | null;
    contactIntro: string | null;
    contactNotice: string | null;
  } | null,
): ContactTexts {
  return {
    label: saved?.contactLabel || DEFAULT_CONTACT_LABEL,
    intro: saved?.contactIntro || DEFAULT_CONTACT_INTRO,
    formTitle: saved?.contactLabel || DEFAULT_FORM_TITLE,
    notice: saved?.contactNotice || null,
  };
}

export interface ContactTextsValue {
  label: string | null;
  intro: string | null;
  notice: string | null;
}

export type ContactTextsInput =
  { ok: true; value: ContactTextsValue } | { ok: false; message: string };

const oneLine = (s: string) => s.trim().replace(/\s+/g, " ");

/** Saisie de l'administrateur : valeurs nettoyées, vides = valeurs par défaut (null). */
export function parseContactTexts(raw: {
  label: unknown;
  intro: unknown;
  notice: unknown;
}): ContactTextsInput {
  if (
    typeof raw.label !== "string" ||
    typeof raw.intro !== "string" ||
    typeof raw.notice !== "string"
  ) {
    return { ok: false, message: "texte attendu" };
  }
  const label = oneLine(raw.label);
  const intro = oneLine(raw.intro);
  const notice = raw.notice.replace(/\r\n/g, "\n").trim();
  if (label.length > CONTACT_LABEL_MAX) {
    return { ok: false, message: `intitulé : ${CONTACT_LABEL_MAX} caractères au plus` };
  }
  if (intro.length > CONTACT_INTRO_MAX) {
    return { ok: false, message: `introduction : ${CONTACT_INTRO_MAX} caractères au plus` };
  }
  if (notice.length > CONTACT_NOTICE_MAX) {
    return { ok: false, message: `texte : ${CONTACT_NOTICE_MAX} caractères au plus` };
  }
  return {
    ok: true,
    value: { label: label || null, intro: intro || null, notice: notice || null },
  };
}

/** Morceau de texte, en gras ou non. */
export interface Span {
  text: string;
  bold: boolean;
}

export type RichBlock = { type: "p"; lines: Span[][] } | { type: "ul"; items: Span[][] };

const BULLET = /^[*-]\s+/;

/** `**gras**` dans une ligne ; des astérisques sans paire restent du texte. */
function spans(line: string): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of line.matchAll(/\*\*(.+?)\*\*/g)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), bold: false });
    const bold = (m[1] ?? "").trim();
    if (bold) out.push({ text: bold, bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), bold: false });
  return out;
}

/**
 * Mise en forme minimale du texte de l'administrateur, rendue par React (jamais de HTML
 * injecté) : paragraphes séparés par une ligne vide, lignes commençant par `* ` ou `- `
 * en liste à puces, `**gras**`.
 */
export function parseRichText(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let current: RichBlock | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      current = null;
      continue;
    }
    if (BULLET.test(line)) {
      if (current?.type !== "ul") {
        current = { type: "ul", items: [] };
        blocks.push(current);
      }
      current.items.push(spans(line.replace(BULLET, "")));
    } else {
      if (current?.type !== "p") {
        current = { type: "p", lines: [] };
        blocks.push(current);
      }
      current.lines.push(spans(line));
    }
  }
  return blocks;
}
