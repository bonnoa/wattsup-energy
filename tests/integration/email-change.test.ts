import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/server/auth";

// Changement d'email (T52) sans envoi d'emails configuré : le mot de passe actuel est exigé,
// puis l'adresse change directement.

const unique = () => `t${Date.now()}${Math.random().toString(36).slice(2, 8)}@wattsup.test`;
const password = "motdepasse-solide";

async function signedInUser() {
  const email = unique();
  const created = await auth.api.signUpEmail({ body: { email, password, name: "M" } });
  const signedIn = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
  const headers = new Headers({ cookie: signedIn.headers.get("set-cookie") ?? "" });
  return { id: created.user.id, email, headers };
}

const emailOf = async (id: string) =>
  (await db.select({ email: user.email }).from(user).where(eq(user.id, id)))[0]?.email;

/** Le corps attendu par Better Auth n'a pas de mot de passe : champ ajouté par le hook. */
const change = (headers: Headers, body: { newEmail: string; password?: string }) =>
  auth.api.changeEmail({ body: body as { newEmail: string }, headers });

describe("changement d'email", () => {
  it("refusé sans le mot de passe actuel ou avec un mot de passe faux", async () => {
    const u = await signedInUser();
    await expect(change(u.headers, { newEmail: unique() })).rejects.toThrow(/mot de passe/);
    await expect(
      change(u.headers, { newEmail: unique(), password: "pas-le-bon-mot" }),
    ).rejects.toThrow(/mot de passe/);
    expect(await emailOf(u.id)).toBe(u.email);
  });

  it("appliqué directement avec le bon mot de passe quand l'instance n'envoie pas d'emails", async () => {
    const u = await signedInUser();
    const next = unique();
    await change(u.headers, { newEmail: next, password });
    expect(await emailOf(u.id)).toBe(next);
  });
});
