import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { ensureHousehold } from "./household";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  databaseHooks: {
    user: {
      create: {
        // Chaque compte a son foyer (1 par utilisateur en V1). ensureHousehold est
        // idempotent : getHouseholdContext le rappelle si ce hook a échoué.
        after: async (user) => {
          await ensureHousehold(user.id);
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
