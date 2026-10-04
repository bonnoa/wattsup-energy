import { test as setup } from "@playwright/test";
import { DEMO_STATE, login } from "./helpers";

// Une seule connexion du compte de démo, réutilisée par tous les scénarios : Better Auth
// limite les connexions en production (3 toutes les 10 s).
setup("connexion du compte de démo", async ({ page }) => {
  await login(page);
  await page.context().storageState({ path: DEMO_STATE });
});
