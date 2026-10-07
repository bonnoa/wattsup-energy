import { expect, test } from "@playwright/test";
import { DEMO, E2E_URL } from "./fixtures";
import { open } from "./helpers";

// Passe de sécurisation (T51) : la CSP du build de production ne bloque rien sur les pages
// principales, et le retour après connexion ne sort jamais du site.

const PAGES = ["/", "/chauffage", "/rentabilite", "/contrats", "/reglages", "/compte"];

test("CSP posée et aucune violation sur les pages principales", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  for (const path of PAGES) {
    const res = await page.goto(path);
    expect(res?.headers()["content-security-policy"], path).toMatch(/'nonce-[^']+'/);
    await page.waitForLoadState("networkidle");
  }
  expect(violations).toEqual([]);
});

test.describe("sans session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("retour après connexion : une adresse externe ramène à l'accueil", async ({ page }) => {
    await open(page, "/connexion?suite=//exemple.com");
    await page.getByLabel("Email").fill(DEMO.email);
    await page.getByLabel("Mot de passe").fill(DEMO.password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(`${E2E_URL}/`);
  });
});
