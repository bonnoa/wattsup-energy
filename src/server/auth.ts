import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { parseInviteCodes, parseSignupMode, signupAllowed } from "@/domain/signup";
import { ensureHousehold } from "./household";

/** Mode d'inscription de l'instance (SIGNUP_MODE, INVITE_CODES). */
export const signupMode = () => parseSignupMode(process.env.SIGNUP_MODE);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  // Suppression du compte depuis la page Compte (mot de passe exigé) : le foyer et toutes ses
  // données partent en cascade.
  user: { deleteUser: { enabled: true } },
  hooks: {
    // L'inscription respecte SIGNUP_MODE, y compris par un appel direct à l'API.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const allowed = signupAllowed(
        signupMode(),
        ctx.headers?.get("x-invite-code"),
        parseInviteCodes(process.env.INVITE_CODES),
      );
      if (!allowed.ok) throw new APIError("FORBIDDEN", { message: allowed.message });
    }),
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
