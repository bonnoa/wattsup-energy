import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  account,
  category,
  contract,
  contractPeriod,
  energyInterval,
  equipment,
  fuelEvent,
  household,
  ingestLog,
  instanceSettings,
  ingestToken,
  meterState,
  session,
  tempoOverride,
  user,
} from "@/db/schema";
import { ForbiddenError } from "@/server/admin";
import { auth } from "@/server/auth";
import { getSignupPolicy, updateSignupPolicy } from "@/server/instance";
import { createCategory } from "@/server/categories";
import { householdContextFor } from "@/server/context";
import { createContract } from "@/server/contracts";
import { saveEquipment } from "@/server/equipment";
import { addPurchase } from "@/server/fuel";
import { ingest } from "@/server/ingest/persist";
import { listIngestLog } from "@/server/ingest/status";
import { createIngestToken } from "@/server/ingest/token";
import { updateFuelSettings } from "@/server/settings";
import { CONTRACT_PRESETS } from "@/domain/tariff/schema";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const env = { mode: process.env.SIGNUP_MODE, codes: process.env.INVITE_CODES };
afterEach(() => {
  process.env.SIGNUP_MODE = env.mode;
  process.env.INVITE_CODES = env.codes;
  if (env.mode === undefined) delete process.env.SIGNUP_MODE;
  if (env.codes === undefined) delete process.env.INVITE_CODES;
});

let seq = 0;
const signUp = (headers?: Headers) =>
  auth.api.signUpEmail({
    body: {
      email: `account-${Date.now()}-${++seq}@wattsup.test`,
      password: "motdepasse-de-test",
      name: "T",
    },
    headers,
  });

describe("inscription selon SIGNUP_MODE", () => {
  it("fermée : refusée, même par l'API", async () => {
    process.env.SIGNUP_MODE = "closed";
    await expect(signUp()).rejects.toThrow(/fermées/);
  });

  it("sur invitation : code exigé", async () => {
    process.env.SIGNUP_MODE = "invite";
    process.env.INVITE_CODES = "bienvenue-2026";
    await expect(signUp()).rejects.toThrow(/invitation/);
    await expect(signUp(new Headers({ "x-invite-code": "mauvais" }))).rejects.toThrow(/invitation/);
    const ok = await signUp(new Headers({ "x-invite-code": "bienvenue-2026" }));
    expect(ok.user.id).toBeTruthy();
  });

  // Dans ce fichier (exécuté en séquence) pour ne pas croiser les tests ci-dessus. Le réglage
  // reste « ouvert » : les autres fichiers, en parallèle, continuent d'inscrire leurs comptes.
  it("le réglage de l'administrateur prime sur SIGNUP_MODE ; réservé à l'administrateur", async () => {
    const admin = await createTestHousehold("admin");
    const policy = { mode: "open" as const, codes: ["ami-2026"] };
    await expect(updateSignupPolicy(admin, policy)).rejects.toThrow(ForbiddenError);
    try {
      await updateSignupPolicy({ ...admin, isAdmin: true }, policy);
      process.env.SIGNUP_MODE = "closed";
      expect(await getSignupPolicy()).toEqual({ ...policy, source: "admin" });
      expect((await signUp()).user.id).toBeTruthy();
    } finally {
      await db.delete(instanceSettings);
    }
    expect((await getSignupPolicy()).source).toBe("env");
  });
});

const preset = CONTRACT_PRESETS[0] ?? {
  name: "Base",
  contract: { kind: "base" as const, subscriptionEurYear: 200, priceEurKwh: 0.25 },
};

describe("suppression du compte", () => {
  it("efface le compte, le foyer et toutes ses données (aucune ligne restante)", async () => {
    const email = `delete-${Date.now()}@wattsup.test`;
    const password = "motdepasse-de-test";
    const created = await auth.api.signUpEmail({ body: { email, password, name: "Départ" } });
    const ctx = await householdContextFor(created.user.id);
    const hid = ctx.householdId;

    await createIngestToken(ctx);
    await createCategory(ctx, {
      name: "Eau",
      slug: "eau",
      icon: "droplet",
      color: "grid",
      isHeating: false,
    });
    await createContract(ctx, {
      ...preset,
      subscription: null,
    });
    await addPurchase(ctx, {
      fuel: "pellet",
      qty: 1,
      unit: "bag",
      priceEur: 7,
      date: "2026-01-01",
    });
    await saveEquipment(ctx, "solar", {
      label: "P",
      capacity: 1,
      installedOn: "2025-01-01",
      costEur: 1,
    });
    await ingest(
      hid,
      JSON.stringify({
        version: 1,
        ts: "2026-10-01T10:00:00Z",
        energy: { grid_import_kwh: 10 },
        tempo_color: "bleu",
      }),
    );
    await ingest(
      hid,
      JSON.stringify({ version: 1, ts: "2026-10-01T11:00:00Z", energy: { grid_import_kwh: 11 } }),
    );
    expect(await db.$count(energyInterval, eq(energyInterval.householdId, hid))).toBeGreaterThan(0);

    // Comme depuis Réglages : session ouverte, mot de passe confirmé.
    const signedIn = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
    const cookie = signedIn.headers.get("set-cookie") ?? "";
    await auth.api.deleteUser({ body: { password }, headers: new Headers({ cookie }) });

    const counts = await Promise.all([
      db.$count(user, eq(user.id, created.user.id)),
      db.$count(session, eq(session.userId, created.user.id)),
      db.$count(account, eq(account.userId, created.user.id)),
      db.$count(household, eq(household.id, hid)),
      ...[
        ingestToken,
        category,
        meterState,
        energyInterval,
        tempoOverride,
        ingestLog,
        contract,
        contractPeriod,
        fuelEvent,
        equipment,
      ].map((t) => db.$count(t, eq(t.householdId, hid))),
    ]);
    expect(counts.every((c) => c === 0)).toBe(true);
  });
});

describe("réglages et journal", () => {
  it("réglages combustibles fusionnés ; journal des envois du plus récent au plus ancien", async () => {
    const ctx = await createTestHousehold();
    await updateFuelSettings(ctx, {
      pelletBagKg: 10,
      pelletBagsPerPallet: 72,
      heatingSeason: { from: "11-01", to: "03-31" },
      kwhFactors: { pelletPerKg: 4.6, woodPerStere: 1700 },
    });
    const fresh = await householdContextFor(ctx.userId);
    expect(fresh.settings).toMatchObject({
      pelletBagKg: 10,
      exportEnabled: false,
      heatingSeason: { from: "11-01" },
    });

    await ingest(ctx.householdId, "pas du json");
    await ingest(
      ctx.householdId,
      JSON.stringify({ version: 1, ts: "2026-10-01T10:00:00Z", energy: { grid_import_kwh: 1 } }),
    );
    const log = await listIngestLog(ctx);
    expect(log.map((l) => l.httpStatus)).toEqual([200, 400]);
  });
});

describeTenantIsolation("journal des envois", {
  setup: async (b) => {
    await ingest(b.householdId, "pas du json");
    return null;
  },
  attempt: (a) => listIngestLog(a),
  expect: "empty",
});
describeTenantIsolation("réglages combustibles", {
  setup: async () => null,
  attempt: async (a) => {
    await updateFuelSettings(a, {
      pelletBagKg: 3,
      pelletBagsPerPallet: 3,
      heatingSeason: { from: "01-01", to: "02-01" },
      kwhFactors: { pelletPerKg: 3, woodPerStere: 900 },
    });
    return [];
  },
  expect: "empty",
  untouched: async (b) => {
    expect((await householdContextFor(b.userId)).settings.pelletBagKg).toBe(15);
  },
});
