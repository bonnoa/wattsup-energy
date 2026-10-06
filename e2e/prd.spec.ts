import { expect, test } from "@playwright/test";
import { ALL_ON, open, setDemoProfile } from "./helpers";

// Parcours du PRD (§ « Parcours utilisateurs ») sur le foyer de démo.
test.describe.configure({ mode: "serial" });
test.beforeEach(async () => {
  await setDemoProfile(ALL_ON);
});

test("parcours 1 : le profil énergétique masque le bois dans tout le chauffage", async ({
  page,
}) => {
  await open(page, "/reglages");
  const wood = page.getByRole("switch", { name: /Bois/ });
  await wood.click();
  await expect(wood).toHaveAttribute("aria-checked", "false");
  await open(page, "/chauffage");
  await expect(page.locator("main")).not.toContainText(/\bBois\b/);
  await expect(page.locator("main")).toContainText("Granulés");
});

test("parcours 2 : 12 sacs en réserve → prévision de l'hiver prochain en palettes", async ({
  page,
}) => {
  await open(page, "/chauffage");
  const pellets = page.locator("section", { has: page.getByRole("heading", { name: "Granulés" }) });
  await pellets.getByRole("button", { name: "Corriger le stock" }).click();
  await pellets.getByLabel("sacs restants").fill("12");
  await pellets.getByRole("button", { name: "Enregistrer le relevé" }).click();
  await expect(pellets.getByText("12", { exact: true }).first()).toBeVisible();

  const forecast = page.locator("section", {
    has: page.getByRole("heading", { name: "Prévision de réapprovisionnement" }),
  });
  const next = forecast.getByRole("radio", { name: "Saison prochaine" });
  if (await next.count()) await next.click();
  await expect(
    forecast.getByText(/Pour passer l'hiver .* prévoyez [\d\s\u202f]+ sacs?/),
  ).toBeVisible();
  await forecast.getByRole("radio", { name: "rigoureux" }).click();
  await expect(forecast.getByText(/prévoyez [\d\s\u202f]+ sacs?/)).toBeVisible();
});

test("parcours 3 : rentabilité solaire et batterie, mise à jour du coût", async ({
  page,
}, info) => {
  await open(page, "/rentabilite");
  const solar = page.locator("section", { has: page.getByRole("heading", { name: /Panneaux/ }) });
  await expect(solar.getByRole("img", { name: /Amorti à/ })).toBeVisible();
  await expect(solar.getByText("Économie mensuelle")).toBeVisible();
  const before = await solar.getByRole("img", { name: /Amorti à/ }).getAttribute("aria-label");

  await solar.getByRole("button", { name: /Modifier « Panneaux/ }).click();
  // Une valeur par taille d'écran : chaque passage modifie bien le coût.
  await solar.getByLabel("Coût TTC (€)").fill(info.project.name === "mobile" ? "4800" : "3200");
  await solar.getByRole("button", { name: "Enregistrer" }).click();
  await expect(solar.getByRole("img", { name: /Amorti à/ })).not.toHaveAttribute(
    "aria-label",
    before ?? "",
  );

  const battery = page.locator("section", { has: page.getByRole("heading", { name: /Batterie/ }) });
  await expect(battery.getByText(/Électricité évitée \(décharge\)/)).toBeVisible();
});
