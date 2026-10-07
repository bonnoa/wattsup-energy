import { describe, expect, it } from "vitest";
import { resetPasswordEmail } from "@/domain/mail";

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
