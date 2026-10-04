import postgres from "postgres";
import { runMigrations } from "../scripts/migrate";
import { E2E_DATABASE_URL, DEMO } from "./fixtures";

// Avant le serveur de bout en bout : base de test vide, migrée, avec le foyer de démo
// (deux ans de données, contrats, combustibles, équipements).
async function main() {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql.end();
  await runMigrations(E2E_DATABASE_URL);
  // Import après les migrations : la connexion de l'application lit DATABASE_URL.
  const { seedDemo } = await import("../scripts/seed/seed");
  const r = await seedDemo({ ...DEMO, now: new Date() });
  console.log(`[e2e] foyer de démo prêt (${r.intervals} intervalles)`);
  process.exit(0);
}

void main();
