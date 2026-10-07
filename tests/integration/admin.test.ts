import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { household, session, user } from "@/db/schema";
import {
  AdminError,
  deleteUserAsAdmin,
  ForbiddenError,
  listUsers,
  setUserDisabled,
} from "@/server/admin";
import { auth } from "@/server/auth";
import { createCategory } from "@/server/categories";
import type { HouseholdContext } from "@/server/context";
import { ingest } from "@/server/ingest/persist";
import { createIngestToken, verifyIngestToken } from "@/server/ingest/token";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const PASSWORD = "motdepasse-de-test";

/** Foyer de test promu administrateur (comme la migration le fait pour l'instance de référence). */
async function createAdmin(): Promise<HouseholdContext> {
  const ctx = await createTestHousehold("admin");
  await db.update(user).set({ isAdmin: true }).where(eq(user.id, ctx.userId));
  return { ...ctx, isAdmin: true };
}

const emailOf = async (userId: string) =>
  (await db.select({ email: user.email }).from(user).where(eq(user.id, userId)))[0]?.email ?? "";

const signIn = async (userId: string) =>
  auth.api.signInEmail({ body: { email: await emailOf(userId), password: PASSWORD } });

describe("compte administrateur", () => {
  it("le statut n'est pas saisissable à l'inscription", async () => {
    const res = await auth.api.signUpEmail({
      body: {
        email: `intrus-${Date.now()}@wattsup.test`,
        password: PASSWORD,
        name: "Intrus",
        isAdmin: true,
      } as never,
    }).catch(() => null);
    if (res) {
      const [row] = await db.select().from(user).where(eq(user.id, res.user.id));
      expect(row?.isAdmin).toBe(false);
    }
  });

  it("liste des comptes : profil, postes et valeurs enregistrées", async () => {
    const admin = await createAdmin();
    const b = await createTestHousehold("b");
    await createCategory(b, {
      name: "Eau chaude",
      slug: "eau-chaude",
      icon: "droplet",
      color: "grid",
      isHeating: false,
    });
    await ingest(
      b.householdId,
      JSON.stringify({ version: 1, ts: "2026-10-01T10:00:00Z", energy: { grid_import_kwh: 10 } }),
    );
    await ingest(
      b.householdId,
      JSON.stringify({ version: 1, ts: "2026-10-01T11:00:00Z", energy: { grid_import_kwh: 11 } }),
    );

    const rows = await listUsers(admin);
    const row = rows.find((r) => r.id === b.userId);
    expect(row).toMatchObject({ name: "b", categories: 1, isAdmin: false, disabledAt: null });
    expect(row?.values).toBeGreaterThan(0);
    expect(row?.profile).toMatchObject({ solar: false });
    expect(rows.find((r) => r.id === admin.userId)?.isAdmin).toBe(true);
  });

  it("désactiver : sessions fermées, connexion et envois refusés ; réactiver rétablit tout", async () => {
    const admin = await createAdmin();
    const b = await createTestHousehold("b");
    const { token } = await createIngestToken(b);
    await signIn(b.userId);
    expect(await db.$count(session, eq(session.userId, b.userId))).toBeGreaterThan(0);

    expect(await setUserDisabled(admin, b.userId, true)).toBe(true);
    expect(await db.$count(session, eq(session.userId, b.userId))).toBe(0);
    await expect(signIn(b.userId)).rejects.toThrow(/désactivé/);
    expect(await verifyIngestToken(`Bearer ${token}`)).toBeNull();

    expect(await setUserDisabled(admin, b.userId, false)).toBe(true);
    expect((await signIn(b.userId)).token).toBeTruthy();
    expect(await verifyIngestToken(`Bearer ${token}`)).not.toBeNull();
  });

  it("supprimer : compte, foyer et données partent en cascade", async () => {
    const admin = await createAdmin();
    const b = await createTestHousehold("b");
    expect(await deleteUserAsAdmin(admin, b.userId)).toBe(true);
    expect(await db.$count(user, eq(user.id, b.userId))).toBe(0);
    expect(await db.$count(household, eq(household.id, b.householdId))).toBe(0);
    expect(await deleteUserAsAdmin(admin, b.userId)).toBe(false);
  });

  it("jamais sur son propre compte ni sur un autre administrateur", async () => {
    const admin = await createAdmin();
    const other = await createAdmin();
    await expect(setUserDisabled(admin, admin.userId, true)).rejects.toThrow(AdminError);
    await expect(deleteUserAsAdmin(admin, admin.userId)).rejects.toThrow(AdminError);
    await expect(deleteUserAsAdmin(admin, other.userId)).rejects.toThrow(AdminError);
    expect(await db.$count(user, eq(user.id, other.userId))).toBe(1);
  });

  it("réservé à l'administrateur : un compte ordinaire est refusé", async () => {
    const a = await createTestHousehold("a");
    await expect(listUsers(a)).rejects.toThrow(ForbiddenError);
  });
});

describeTenantIsolation("désactiver un compte (non administrateur)", {
  setup: async (b) => b.userId,
  attempt: (a, id) => setUserDisabled(a, id, true),
  expect: "throws",
  untouched: async (_b, id) => {
    const [row] = await db.select().from(user).where(eq(user.id, id));
    expect(row?.disabledAt).toBeNull();
  },
});

describeTenantIsolation("supprimer un compte (non administrateur)", {
  setup: async (b) => b.userId,
  attempt: (a, id) => deleteUserAsAdmin(a, id),
  expect: "throws",
  untouched: async (_b, id) => {
    expect(await db.$count(user, eq(user.id, id))).toBe(1);
  },
});
