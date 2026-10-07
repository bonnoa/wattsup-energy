import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import type { ContactKind } from "@/domain/contact";
import { contactEmail, type MailContent } from "@/domain/mail";
import type { HouseholdContext } from "./context";
import { sendMail } from "./mail";

// Formulaire de contact (SPEC §9) : le message part par email à l'administrateur de
// l'instance, avec le nom et l'adresse du compte ; il répond directement (reply_to).

/** Refus métier, message en français pour l'interface. */
export class ContactError extends Error {}

export async function sendContactMessage(
  ctx: HouseholdContext,
  input: { kind: ContactKind; message: string },
  options: { version: string; send?: (to: string, content: MailContent) => Promise<void> },
): Promise<void> {
  const admins = await db.select({ email: user.email }).from(user).where(eq(user.isAdmin, true));
  if (admins.length === 0)
    throw new ContactError("Aucun administrateur à prévenir sur cette instance.");
  const content = contactEmail({
    ...input,
    name: ctx.userName,
    email: ctx.userEmail,
    version: options.version,
  });
  const send = options.send ?? ((to, c) => sendMail(to, c));
  await Promise.all(admins.map((a) => send(a.email, content)));
}
