import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import {
  category,
  energyInterval,
  household,
  meterState,
  user,
  weatherDaily,
} from "../../src/db/schema";
import { cellOf } from "../../src/domain/weather";
import { addDays, localParts } from "../../src/lib/time";
import { auth } from "../../src/server/auth";
import { householdContextFor } from "../../src/server/context";
import { generateDemo } from "./generate";

// Foyer de démo (T15) : idempotent, relancer le seed remplace ses données. Refusé en
// production sauf option explicite.

const TZ = "Europe/Paris";
const DEMO_LOCATION = { label: "Nantes (Loire-Atlantique)", lat: 47.22, lon: -1.55 };
const BATCH = 5000;

const CATEGORIES = [
  { slug: "eau-chaude", name: "Eau chaude", icon: "droplet", color: "grid", isHeating: false },
  {
    slug: "chauffage-electrique",
    name: "Chauffage électrique",
    icon: "flame",
    color: "eheat",
    isHeating: true,
  },
] as const;

export interface SeedOptions {
  email: string;
  password: string;
  days?: number;
  seed?: number;
  now?: Date;
}

export async function seedDemo({
  email,
  password,
  days = 730,
  seed = 42,
  now = new Date(),
}: SeedOptions) {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  const userId =
    existing?.id ??
    (await auth.api.signUpEmail({ body: { email, password, name: "Démo" } })).user.id;
  const ctx = await householdContextFor(userId);
  const householdId = ctx.householdId;

  await db
    .update(household)
    .set({
      name: "Foyer démo",
      granularity: "hourly",
      location: DEMO_LOCATION,
      profile: { solar: true, battery: true, pellet: true, wood: true, electricHeating: true },
    })
    .where(eq(household.id, householdId));

  const to = localParts(now, TZ).date; // aujourd'hui exclu : seules les journées terminées
  const from = addDays(to, -days);
  const demo = generateDemo({ from, to, timezone: TZ, seed });

  await db.transaction(async (tx) => {
    await tx.delete(energyInterval).where(eq(energyInterval.householdId, householdId));
    await tx.delete(meterState).where(eq(meterState.householdId, householdId));
    await tx.delete(category).where(eq(category.householdId, householdId));
    await tx.insert(category).values(CATEGORIES.map((c) => ({ ...c, householdId })));

    const rows = demo.hours.flatMap((h) => {
      const base = {
        householdId,
        start: h.start,
        granularity: "hour" as const,
        source: "ha" as const,
      };
      const metrics: [string, number][] = [
        ["grid_import", h.gridImport],
        ["grid_export", h.gridExport],
        ["solar_production", h.solar],
        ["battery_charge", h.batteryCharge],
        ["battery_discharge", h.batteryDischarge],
        ["category:eau-chaude", h.waterHeater],
        ["category:chauffage-electrique", h.electricHeating],
      ];
      // L'import réseau est toujours présent (couverture horaire) ; les autres métriques
      // nulles sont omises, comme une heure sans production ou sans décharge.
      return metrics
        .filter(([metric, kwh]) => metric === "grid_import" || kwh > 0)
        .map(([metric, kwh]) => ({ ...base, metric, kwh }));
    });
    for (let i = 0; i < rows.length; i += BATCH) {
      await tx.insert(energyInterval).values(rows.slice(i, i + BATCH));
    }
  });

  // Météo de démo seulement là où Open-Meteo n'a encore rien fourni pour cette maille.
  const cell = cellOf(DEMO_LOCATION);
  for (let i = 0; i < demo.days.length; i += BATCH) {
    await db
      .insert(weatherDaily)
      .values(
        demo.days.slice(i, i + BATCH).map((d) => ({ ...cell, ...d, source: "archive" as const })),
      )
      .onConflictDoNothing();
  }

  const intervals = await db.$count(energyInterval, eq(energyInterval.householdId, householdId));
  return { householdId, from, to, hours: demo.hours.length, intervals };
}
