import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { DEMO, E2E_DATABASE_URL } from "./fixtures";

/** Session du compte de démo, enregistrée par auth.setup.ts. */
export const DEMO_STATE = "e2e/.auth/demo.json";

export interface Profile {
  solar: boolean;
  battery: boolean;
  pellet: boolean;
  wood: boolean;
  electricHeating: boolean;
}

export const ALL_ON: Profile = {
  solar: true,
  battery: true,
  pellet: true,
  wood: true,
  electricHeating: true,
};

/** Profil du foyer de démo, écrit directement en base (préparation d'un scénario). */
export async function setDemoProfile(profile: Profile) {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql`
      update household set profile = ${sql.json(profile as unknown as postgres.JSONValue)}
      where owner_id = (select id from "user" where email = ${DEMO.email})`;
  } finally {
    await sql.end();
  }
}

/** Ouvre une page et attend que React ait pris la main (sinon un clic peut se perdre). */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

export async function login(page: Page, email = DEMO.email, password = DEMO.password) {
  await open(page, "/connexion");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/connexion/);
}

/** Aucun défilement horizontal : la page tient dans la largeur de l'écran. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "défilement horizontal").toBeLessThanOrEqual(0);
}
