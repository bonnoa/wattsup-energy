import { describe, expect, it } from "vitest";
import { contactEmail, newIdeaEmail, resetPasswordEmail } from "@/domain/mail";

describe("resetPasswordEmail", () => {
  it("lien dans le texte et le HTML ; prénom échappé", () => {
    const m = resetPasswordEmail("<Alex>", "https://wattsup.test/reset?token=a&b");
    expect(m.subject).toContain("mot de passe");
    expect(m.text).toContain("https://wattsup.test/reset?token=a&b");
    expect(m.html).toContain('href="https://wattsup.test/reset?token=a&amp;b"');
    expect(m.html).toContain("&lt;Alex&gt;");
    expect(m.html).not.toContain("<Alex>");
  });

  it("sans prénom : formule neutre", () => {
    expect(resetPasswordEmail("", "https://x.test").text.startsWith("Bonjour,")).toBe(true);
  });
});

describe("newIdeaEmail", () => {
  it("titre, description, auteur et lien ; contenu saisi échappé", () => {
    const m = newIdeaEmail({
      title: "Thème <sombre>",
      description: "Pour le soir.\n\nEt la nuit.",
      authorName: "Élise",
      authorEmail: "elise@example.test",
      url: "https://wattsup.test/idees",
    });
    expect(m.subject).toBe("Nouvelle idée : Thème <sombre>");
    expect(m.text).toContain("Élise <elise@example.test>");
    expect(m.text).toContain("Pour le soir.\n\nEt la nuit.");
    expect(m.text).toContain("https://wattsup.test/idees");
    expect(m.html).toContain("Thème &lt;sombre&gt;");
    expect(m.html).not.toContain("<sombre>");
    expect(m.html).toContain('<p style="white-space:pre-wrap">Et la nuit.</p>');
  });
});

describe("contactEmail", () => {
  it("motif dans l'objet, expéditeur et version ; réponse à l'expéditeur", () => {
    const m = contactEmail({
      kind: "bug",
      message:
        "Le graphique <Production> est vide depuis hier et je ne comprends pas pourquoi.\nDétails…",
      name: "Élise",
      email: "elise@example.test",
      version: "0.1.0",
    });
    expect(m.subject).toBe("[Bug] Le graphique <Production> est vide depuis hier et je ne com…");
    expect(m.replyTo).toBe("elise@example.test");
    expect(m.text).toContain("Signaler un bug — Élise <elise@example.test>, WattsUp 0.1.0");
    expect(m.html).toContain("&lt;Production&gt;");
    expect(m.html).not.toContain("<Production>");
    expect(
      contactEmail({
        ...m,
        kind: "contact",
        message: "Bonjour",
        name: "A",
        email: "a@b.c",
        version: "1",
      }).subject,
    ).toBe("[Contact] Bonjour");
  });
});
