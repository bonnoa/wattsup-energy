import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";

// Changement d'email (T52) avec l'envoi d'emails configuré : l'adresse ne change qu'une fois
// le lien, envoyé à la nouvelle adresse, ouvert. Resend est simulé (fetch).

const sent: { to: string; text: string }[] = [];
let auth: typeof import("@/server/auth").auth;

beforeAll(async () => {
  process.env.RESEND_API_KEY = "re_test_only";
  process.env.MAIL_FROM = "WattsUp <noreply@wattsup.test>";
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { to: string; text: string };
    sent.push({ to: body.to, text: body.text });
    return new Response("{}", { status: 200 });
  });
  vi.resetModules();
  ({ auth } = await import("@/server/auth"));
});

afterAll(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
});

const unique = () => `t${Date.now()}${Math.random().toString(36).slice(2, 8)}@wattsup.test`;
const password = "motdepasse-solide";

describe("changement d'email confirmé par lien", () => {
  it("lien envoyé à la nouvelle adresse ; l'adresse change à l'ouverture du lien", async () => {
    const email = unique();
    const created = await auth.api.signUpEmail({ body: { email, password, name: "M" } });
    const signedIn = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
    const headers = new Headers({ cookie: signedIn.headers.get("set-cookie") ?? "" });
    const next = unique();

    await auth.api.changeEmail({
      body: { newEmail: next, password } as { newEmail: string },
      headers,
    });
    const emailOf = async () =>
      (await db.select().from(user).where(eq(user.id, created.user.id)))[0];
    expect((await emailOf())?.email).toBe(email);

    const mail = sent.find((m) => m.to === next);
    expect(mail?.text).toMatch(/une heure/);
    const token = /verify-email\?token=([^&\s]+)/.exec(mail?.text ?? "")?.[1];
    expect(token).toBeTruthy();

    await auth.api.verifyEmail({ query: { token: token ?? "" } });
    const row = await emailOf();
    expect(row?.email).toBe(next);
    expect(row?.emailVerified).toBe(true);
  });
});
