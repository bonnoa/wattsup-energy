import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { instanceSettings, user } from "@/db/schema";
import { DEFAULT_CONTACT_LABEL } from "@/domain/instance-texts";
import { ForbiddenError } from "@/server/admin";
import { getContactTexts, getSignupPolicy, updateContactTexts } from "@/server/instance";
import { createTestHousehold } from "../helpers/tenancy";

// Textes de la page Contact (T53) : réglés par l'administrateur seulement, sans toucher au
// mode d'inscription enregistré dans la même ligne.

afterAll(async () => {
  await db
    .update(instanceSettings)
    .set({ contactLabel: null, contactIntro: null, contactNotice: null });
});

describe("textes de la page Contact", () => {
  it("par défaut : « Contact » et aucun texte", async () => {
    await db
      .update(instanceSettings)
      .set({ contactLabel: null, contactIntro: null, contactNotice: null });
    expect((await getContactTexts()).label).toBe(DEFAULT_CONTACT_LABEL);
    expect((await getContactTexts()).notice).toBeNull();
  });

  it("un non-administrateur ne peut pas les changer", async () => {
    const ctx = await createTestHousehold("texts-user");
    await expect(
      updateContactTexts(ctx, { label: "Pirate", intro: null, notice: null }),
    ).rejects.toThrow(ForbiddenError);
    expect((await getContactTexts()).label).toBe(DEFAULT_CONTACT_LABEL);
  });

  it("l'administrateur les enregistre ; le mode d'inscription est conservé", async () => {
    const base = await createTestHousehold("texts-admin");
    await db.update(user).set({ isAdmin: true }).where(eq(user.id, base.userId));
    const admin = { ...base, isAdmin: true };
    const before = await getSignupPolicy();

    await updateContactTexts(admin, {
      label: "Écrire au créateur",
      intro: "Écrivez à Alex.",
      notice: "**Hébergé en France**",
    });
    expect(await getContactTexts()).toEqual({
      label: "Écrire au créateur",
      intro: "Écrivez à Alex.",
      formTitle: "Écrire au créateur",
      notice: "**Hébergé en France**",
    });
    expect(await getSignupPolicy()).toEqual(before);

    await updateContactTexts(admin, { label: null, intro: null, notice: null });
    expect((await getContactTexts()).label).toBe(DEFAULT_CONTACT_LABEL);
  });
});
