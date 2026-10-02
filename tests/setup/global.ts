import postgres from "postgres";
import { runMigrations } from "../../scripts/migrate";

const url =
  process.env.TEST_DATABASE_URL ?? "postgres://wattsup:wattsup@localhost:5432/wattsup_test";

// Repart d'une base vide et migrée à chaque lancement de la suite d'intégration.
export default async function setup() {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`DROP SCHEMA IF EXISTS public CASCADE`;
    await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
    await sql`CREATE SCHEMA public`;
  } catch (err) {
    throw new Error(
      `Base de test injoignable (${url}). Lancer \`docker compose up -d db\`.\n${String(err)}`,
    );
  } finally {
    await sql.end();
  }
  await runMigrations(url);
}
