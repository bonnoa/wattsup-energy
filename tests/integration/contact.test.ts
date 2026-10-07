import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import type { MailContent } from "@/domain/mail";
import { sendContactMessage } from "@/server/contact";
import { createTestHousehold } from "../helpers/tenancy";

describe("contact", () => {
  it("envoyé à chaque administrateur, au nom du compte, réponse à son adresse", async () => {
    const admin = await createTestHousehold("admin");
    await db.update(user).set({ isAdmin: true }).where(eq(user.id, admin.userId));
    const [adminRow] = await db.select().from(user).where(eq(user.id, admin.userId));
    const a = { ...(await createTestHousehold("a")), userName: "Élise", userEmail: "e@x.test" };

    const sent: { to: string; content: MailContent }[] = [];
    await sendContactMessage(
      a,
      { kind: "bug", message: "Le graphique est vide." },
      { version: "0.1.0", send: async (to, content) => void sent.push({ to, content }) },
    );
    const mine = sent.find((m) => m.to === adminRow?.email);
    expect(mine?.content.subject).toBe("[Bug] Le graphique est vide.");
    expect(mine?.content.replyTo).toBe("e@x.test");
    expect(mine?.content.text).toContain("Élise <e@x.test>");
  });
});
