import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, household, user } from "@/db/schema";
import { NAME_MAX } from "@/domain/signup";
import { auth } from "@/server/auth";
import { ensureHousehold } from "@/server/household";

const unique = () => `t${Date.now()}${Math.random().toString(36).slice(2, 8)}@wattsup.test`;

describe("inscription", () => {
  it("crée l'utilisateur et son foyer avec les valeurs par défaut", async () => {
    const email = unique();
    const res = await auth.api.signUpEmail({
      body: { email, password: "motdepasse-solide", name: "Alex" },
    });
    expect(res.user.email).toBe(email);

    const [home] = await db.select().from(household).where(eq(household.ownerId, res.user.id));
    expect(home).toBeDefined();
    expect(home?.timezone).toBe("Europe/Paris");
    expect(home?.granularity).toBe("hourly");
    expect(home?.profile).toEqual(DEFAULT_PROFILE);
    expect(home?.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("refuse un mot de passe de moins de 10 caractères", async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: unique(), password: "court", name: "A" } }),
    ).rejects.toThrow();
  });

  it("permet de se connecter avec les identifiants créés", async () => {
    const email = unique();
    await auth.api.signUpEmail({ body: { email, password: "motdepasse-solide", name: "B" } });
    const res = await auth.api.signInEmail({ body: { email, password: "motdepasse-solide" } });
    expect(res.token).toBeTruthy();
  });
});

describe("nom affiché", () => {
  it("refusé vide ou au-delà de NAME_MAX caractères ; modifiable depuis la session", async () => {
    const password = "motdepasse-solide";
    await expect(
      auth.api.signUpEmail({ body: { email: unique(), password, name: "x".repeat(NAME_MAX + 1) } }),
    ).rejects.toThrow(/nom attendu/);

    const email = unique();
    const created = await auth.api.signUpEmail({ body: { email, password, name: "E" } });
    const signedIn = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
    const headers = new Headers({ cookie: signedIn.headers.get("set-cookie") ?? "" });
    await expect(auth.api.updateUser({ body: { name: "  " }, headers })).rejects.toThrow(
      /nom attendu/,
    );
    await auth.api.updateUser({ body: { name: "Élise Martin" }, headers });
    const [row] = await db.select().from(user).where(eq(user.id, created.user.id));
    expect(row?.name).toBe("Élise Martin");
  });
});

describe("ensureHousehold", () => {
  it("est idempotent : un seul foyer par utilisateur", async () => {
    const res = await auth.api.signUpEmail({
      body: { email: unique(), password: "motdepasse-solide", name: "C" },
    });
    const a = await ensureHousehold(res.user.id);
    const b = await ensureHousehold(res.user.id);
    expect(a.id).toBe(b.id);
    const rows = await db.select().from(household).where(eq(household.ownerId, res.user.id));
    expect(rows).toHaveLength(1);
  });

  it("supprimer l'utilisateur supprime son foyer (cascade)", async () => {
    const res = await auth.api.signUpEmail({
      body: { email: unique(), password: "motdepasse-solide", name: "D" },
    });
    await db.delete(user).where(eq(user.id, res.user.id));
    const rows = await db.select().from(household).where(eq(household.ownerId, res.user.id));
    expect(rows).toHaveLength(0);
  });
});
