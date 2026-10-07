import { afterAll, describe, expect, it, vi } from "vitest";

// Mot de passe oublié de bout en bout, avec un useSend simulé : la configuration doit être
// en place avant le chargement de la configuration Better Auth.
const sent = vi.hoisted(() => {
  process.env.USESEND_URL = "https://usesend.test";
  process.env.USESEND_API_KEY = "us_test";
  process.env.MAIL_FROM = "WattsUp <noreply@wattsup.test>";
  return [] as { to: string; text: string }[];
});

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://usesend.test/")) {
    const body = JSON.parse(String(init?.body)) as { to: string; text: string };
    sent.push(body);
    return new Response(JSON.stringify({ emailId: "e1" }), { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

const { auth } = await import("@/server/auth");

describe("mot de passe oublié", () => {
  it("lien par email, nouveau mot de passe, connexion avec celui-ci", async () => {
    const email = `oubli-${Date.now()}@wattsup.test`;
    await auth.api.signUpEmail({ body: { email, password: "ancien-mot-de-passe", name: "Alex" } });

    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/nouveau-mot-de-passe" } });
    const mail = sent.at(-1);
    expect(mail?.to).toBe(email);
    const link = mail?.text.match(/https?:\/\/\S+/)?.[0] ?? "";
    const token = new URL(link).pathname.split("/").at(-1) ?? "";
    expect(token.length).toBeGreaterThan(10);

    await auth.api.resetPassword({ body: { newPassword: "nouveau-mot-de-passe", token } });
    const ok = await auth.api.signInEmail({ body: { email, password: "nouveau-mot-de-passe" } });
    expect(ok.user.email).toBe(email);
    await expect(
      auth.api.signInEmail({ body: { email, password: "ancien-mot-de-passe" } }),
    ).rejects.toThrow();
  });

  it("adresse inconnue : aucun email, même réponse", async () => {
    const before = sent.length;
    await auth.api.requestPasswordReset({
      body: { email: "personne@wattsup.test", redirectTo: "/nouveau-mot-de-passe" },
    });
    expect(sent.length).toBe(before);
  });
});
