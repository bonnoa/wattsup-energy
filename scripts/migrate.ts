// Applique les migrations SQL de ./drizzle. Utilisé en dev (`pnpm db:migrate`),
// par les tests d'intégration et au démarrage du conteneur (T11).
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL manquante");
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.log("Migrations appliquées"))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
