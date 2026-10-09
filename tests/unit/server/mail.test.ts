import { describe, expect, it } from "vitest";
import { mailConfig, sendMail, type MailConfig } from "@/server/mail";

const content = { subject: "Objet", text: "Texte", html: "<p>HTML</p>" };

type Call = { url: string; init: RequestInit };
const capture = (status = 200) => {
  const calls: Call[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return new Response("{}", { status });
  };
  const call = (i = 0): Call => {
    const c = calls[i];
    if (!c) throw new Error("aucun appel");
    return c;
  };
  return { calls, call, fetchFn };
};

describe("mailConfig", () => {
  it("Brevo prioritaire sur Resend ; expéditeur nécessaire", () => {
    expect(
      mailConfig({ BREVO_API_KEY: " xkeysib-1 ", RESEND_API_KEY: "re_1", MAIL_FROM: "a@b.c" }),
    ).toEqual({ provider: "brevo", apiKey: "xkeysib-1", from: "a@b.c" });
    expect(mailConfig({ RESEND_API_KEY: " re_1 ", MAIL_FROM: "a@b.c" })).toEqual({
      provider: "resend",
      apiKey: "re_1",
      from: "a@b.c",
    });
    expect(mailConfig({ BREVO_API_KEY: "xkeysib-1" })).toBeNull();
    expect(mailConfig({ MAIL_FROM: "a@b.c" })).toBeNull();
  });
});

describe("sendMail par Brevo", () => {
  const config: MailConfig = {
    provider: "brevo",
    apiKey: "xkeysib-1",
    from: "WattsUp Energy <a@b.c>",
  };

  it("POST sur l'API Brevo : clé, expéditeur nommé, contenu texte et HTML, réponse", async () => {
    const { call, fetchFn } = capture(201);
    await sendMail("x@y.z", { ...content, replyTo: "elise@example.test" }, config, fetchFn);
    const c = call();
    expect(c.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((c.init.headers as Record<string, string>)["api-key"]).toBe("xkeysib-1");
    expect(JSON.parse(String(c.init.body))).toEqual({
      sender: { name: "WattsUp Energy", email: "a@b.c" },
      to: [{ email: "x@y.z" }],
      subject: "Objet",
      textContent: "Texte",
      htmlContent: "<p>HTML</p>",
      replyTo: { email: "elise@example.test" },
    });
  });

  it("expéditeur sans nom ; refus de Brevo : erreur", async () => {
    const { call, fetchFn } = capture(201);
    await sendMail("x@y.z", content, { ...config, from: "a@b.c" }, fetchFn);
    expect(JSON.parse(String(call().init.body)).sender).toEqual({ email: "a@b.c" });
    await expect(sendMail("x@y.z", content, config, capture(401).fetchFn)).rejects.toThrow(
      "Brevo : HTTP 401",
    );
  });
});

describe("sendMail par Resend", () => {
  const config: MailConfig = { provider: "resend", apiKey: "re_1", from: "WattsUp <a@b.c>" };

  it("POST sur l'API Resend avec la clé et le contenu, réponse en reply_to", async () => {
    const { call, fetchFn } = capture();
    await sendMail("x@y.z", { ...content, replyTo: "elise@example.test" }, config, fetchFn);
    const c = call();
    expect(c.url).toBe("https://api.resend.com/emails");
    expect((c.init.headers as Record<string, string>).authorization).toBe("Bearer re_1");
    expect(JSON.parse(String(c.init.body))).toEqual({
      to: "x@y.z",
      from: "WattsUp <a@b.c>",
      ...content,
      reply_to: "elise@example.test",
    });
  });

  it("refus de Resend ou configuration absente : erreur", async () => {
    await expect(sendMail("x@y.z", content, config, capture(403).fetchFn)).rejects.toThrow("403");
    await expect(sendMail("x@y.z", content, null)).rejects.toThrow("non configuré");
  });
});
