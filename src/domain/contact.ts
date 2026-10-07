// Formulaire de contact (SPEC §9) : motif et message, envoyés par email à l'administrateur. Pur.

export const CONTACT_KINDS = ["contact", "bug"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  contact: "Prendre contact",
  bug: "Signaler un bug",
};

export const CONTACT_MESSAGE_MAX = 2000;

export function parseContactInput(input: {
  kind: unknown;
  message: unknown;
}): { ok: true; value: { kind: ContactKind; message: string } } | { ok: false; errors: string[] } {
  const kind = CONTACT_KINDS.find((k) => k === input.kind);
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const errors: string[] = [];
  if (!kind) errors.push("Choisissez un motif.");
  if (!message) errors.push("Écrivez votre message.");
  else if (message.length > CONTACT_MESSAGE_MAX) {
    errors.push(`Message : ${CONTACT_MESSAGE_MAX} caractères au plus.`);
  }
  return kind && errors.length === 0
    ? { ok: true, value: { kind, message } }
    : { ok: false, errors };
}
