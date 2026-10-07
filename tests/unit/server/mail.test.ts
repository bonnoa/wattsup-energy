import { describe, expect, it } from "vitest";
import { mailConfig, sendMail } from "@/server/mail";

const content = { subject: "Objet", text: "Texte", html: "<p>HTML</p>" };

describe("mailConfig", () => {
  it("les trois variables sont nécessaires ; barre finale retirée", () => {
    expect(
      mailConfig({
        USESEND_URL: "https://mail.test/",
        USESEND_API_KEY: "us_1",
        MAIL_FROM: "a@b.c",
      }),
    ).toEqual({
      url: "https://mail.test",
      apiKey: "us_1",
      from: "a@b.c",
    });
    expect(mailConfig({ USESEND_URL: "https://mail.test", MAIL_FROM: "a@b.c" })).toBeNull();
  });
});

describe("sendMail", () => {
  const config = { url: "https://mail.test", apiKey: "us_1", from: "WattsUp <a@b.c>" };

  it("POST /api/v1/emails avec le jeton et le contenu", async () => {
    let call: { url: string; init?: RequestInit } | null = null;
    await sendMail("x@y.z", content, config, async (url, init) => {
      call = { url, init };
      return new Response(JSON.stringify({ emailId: "e1" }), { status: 200 });
    });
    expect(call).not.toBeNull();
    const c = call as unknown as { url: string; init: RequestInit };
    expect(c.url).toBe("https://mail.test/api/v1/emails");
    expect((c.init.headers as Record<string, string>).authorization).toBe("Bearer us_1");
    expect(JSON.parse(String(c.init.body))).toEqual({
      to: "x@y.z",
      from: "WattsUp <a@b.c>",
      ...content,
    });
  });

  it("refus de useSend ou configuration absente : erreur", async () => {
    await expect(
      sendMail("x@y.z", content, config, async () => new Response("", { status: 403 })),
    ).rejects.toThrow("403");
    await expect(sendMail("x@y.z", content, null)).rejects.toThrow("non configuré");
  });
});
