import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL, E2E_PORT, E2E_URL } from "./e2e/fixtures";
import { DEMO_STATE } from "./e2e/helpers";

// Tests de bout en bout (T33) : build de production servi sur un port dédié, base de test
// réinitialisée et peuplée par e2e/prepare.ts. Aucun appel sortant (Tempo, météo coupés).
const pnpm = "corepack pnpm@9.15.9";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: E2E_URL,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "connexion", testMatch: /auth\.setup\.ts/ },
    {
      name: "bureau",
      dependencies: ["connexion"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
        storageState: DEMO_STATE,
      },
    },
    {
      name: "mobile",
      dependencies: ["connexion"],
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        storageState: DEMO_STATE,
      },
    },
  ],
  webServer: {
    command: `${pnpm} exec tsx --tsconfig tsconfig.json e2e/prepare.ts && ${pnpm} exec next build && ${pnpm} exec next start -p ${E2E_PORT}`,
    url: `${E2E_URL}/api/health`,
    timeout: 360_000,
    reuseExistingServer: false,
    stdout: "pipe",
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      DATABASE_URL: E2E_DATABASE_URL,
      BETTER_AUTH_SECRET: "e2e-secret-not-for-production-0123456789",
      BETTER_AUTH_URL: E2E_URL,
      TEMPO_SYNC: "off",
      WEATHER_SYNC: "off",
      SIGNUP_MODE: "open",
    },
  },
});
