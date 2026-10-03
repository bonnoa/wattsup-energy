import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Applique les migrations SQL de ./drizzle avec une connexion dédiée. */
export async function migrateOnBoot(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante : migrations impossibles");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("[wattsup] migrations appliquées");
  } finally {
    await client.end();
  }
}

export async function onServerStart(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.RUN_MIGRATIONS !== "off") await migrateOnBoot();
  const { startScheduler } = await import("./scheduler");
  startScheduler();
}
