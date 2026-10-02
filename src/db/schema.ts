import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { EnergyProfile } from "../domain/profile";
import { user } from "./auth-schema";

export * from "./auth-schema";

// Modèle de données : SPEC §5. Toute table métier porte household_id.

export const granularity = pgEnum("granularity", ["hourly", "daily"]);

export type { EnergyProfile } from "../domain/profile";

export interface HouseholdSettings {
  exportEnabled: boolean;
  exportPriceEurKwh: number;
  batteryGridCharging: boolean;
  pelletBagKg: number;
  pelletBagsPerPallet: number;
  /** Bornes de la saison de chauffe, "MM-JJ". */
  heatingSeason: { from: string; to: string };
  kwhFactors: { pelletPerKg: number; woodPerStere: number };
}

export const DEFAULT_PROFILE: EnergyProfile = {
  solar: false,
  battery: false,
  pellet: false,
  wood: false,
  electricHeating: false,
};

export const DEFAULT_SETTINGS: HouseholdSettings = {
  exportEnabled: false,
  exportPriceEurKwh: 0,
  batteryGridCharging: false,
  pelletBagKg: 15,
  pelletBagsPerPallet: 66,
  heatingSeason: { from: "10-01", to: "04-30" },
  kwhFactors: { pelletPerKg: 4.8, woodPerStere: 1800 },
};

export const household = pgTable("household", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Mon foyer"),
  timezone: text("timezone").notNull().default("Europe/Paris"),
  granularity: granularity("granularity").notNull().default("hourly"),
  profile: jsonb("profile").$type<EnergyProfile>().notNull().default(DEFAULT_PROFILE),
  settings: jsonb("settings").$type<HouseholdSettings>().notNull().default(DEFAULT_SETTINGS),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

const householdRef = () =>
  uuid("household_id")
    .notNull()
    .references(() => household.id, { onDelete: "cascade" });

/** Tokens d'ingestion HA : seul le hash sha-256 est stocké (SPEC §5, §12). */
export const ingestToken = pgTable(
  "ingest_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: householdRef(),
    /** Début du token, affiché pour l'identifier (ex. "wu_3fA9k2Lm"). */
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("ingest_token_household_idx").on(t.householdId),
    // Un seul token actif par foyer.
    uniqueIndex("ingest_token_one_active_idx")
      .on(t.householdId)
      .where(sql`${t.revokedAt} is null`),
  ],
);
