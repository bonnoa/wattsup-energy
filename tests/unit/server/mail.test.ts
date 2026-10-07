import { describe, expect, it } from "vitest";
import { mailConfig, sendMail } from "@/server/mail";

const content = { subject: "Objet", text: "Texte", html: "<p>HTML</p>" };

describe("mailConfig", () => {
  it("clé et expéditeur nécessaires", () => {
    expect(mailConfig({ RESEND_API_KEY: " re_1 ", MAIL_FROM: "a@b.c" })).toEqual({
      apiKey: "re_1",
      from: "a@b.c",
    });
    expect(mailConfig({ MAIL_FROM: "a@b.c" })).toBeNull();
  });
});

describe("sendMail", () => {
  const config = { apiKey: "re_1", from: "WattsUp <a@b.c>" };

  it("POST sur l'API Resend avec la clé et le contenu", async () => {
    let call: { url: string; init?: RequestInit } | null = null;
    await sendMail("x@y.z", content, config, async (url, init) => {
      call = { url, init };
      return new Response(JSON.stringify({ id: "e1" }), { status: 200 });
    });
    const c = call as unknown as { url: string; init: RequestInit };
    expect(c.url).toBe("https://api.resend.com/emails");
    expect((c.init.headers as Record<string, string>).authorization).toBe("Bearer re_1");
    expect(JSON.parse(String(c.init.body))).toEqual({
      to: "x@y.z",
      from: "WattsUp <a@b.c>",
      ...content,
    });
  });

  it("refus de Resend ou configuration absente : erreur", async () => {
    await expect(
      sendMail("x@y.z", content, config, async () => new Response("", { status: 403 })),
    ).rejects.toThrow("403");
    await expect(sendMail("x@y.z", content, null)).rejects.toThrow("non configuré");
  });
});
