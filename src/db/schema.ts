import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

// Modèle de données : SPEC §5. Toute table métier porte household_id.

export const granularity = pgEnum("granularity", ["hourly", "daily"]);

export interface EnergyProfile {
  solar: boolean;
  battery: boolean;
  pellet: boolean;
  wood: boolean;
  electricHeating: boolean;
}

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
