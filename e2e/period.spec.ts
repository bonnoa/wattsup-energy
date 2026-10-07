import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// Changement de période sur la même page : le lien touché devient actif aussitôt et pulse,
// et le contenu s'estompe pendant le chargement (comme pour le menu). Seul le retour
// immédiat est vérifié : la fin de la navigation dépend du temps de calcul du serveur.

test("Vue d'ensemble : clic sur Année, retour visuel immédiat", async ({ page }) => {
  await open(page, "/");
  const year = page.getByRole("tab", { name: "Année" });
  await year.click();
  await expect(year).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  await expect(page.getByRole("tab", { name: "Mois" })).toHaveAttribute("aria-selected", "false", {
    timeout: 1_000,
  });
  await expect(page.locator("main [aria-busy]")).toHaveAttribute("aria-busy", "true", {
    timeout: 1_000,
  });
});

test("Chauffage : flèche de saison, retour visuel immédiat", async ({ page }) => {
  await open(page, "/chauffage");
  const previous = page.getByRole("link", { name: "Saison précédente" });
  await previous.click();
  await expect(previous).toHaveClass(/animate-pulse/, { timeout: 1_000 });
  await expect(page.locator("main [aria-busy]")).toHaveAttribute("aria-busy", "true", {
    timeout: 1_000,
  });
});
