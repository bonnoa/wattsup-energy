// Valeurs de test des parcours de bout en bout (base wattsup_test uniquement).
export const E2E_PORT = 3100;
export const E2E_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://wattsup:wattsup@localhost:5432/wattsup_test";
export const DEMO = { email: "e2e-demo@wattsup.test", password: "motdepasse-e2e-demo" };
