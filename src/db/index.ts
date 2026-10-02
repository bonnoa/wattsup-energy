import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante (voir .env.example)");
  return url;
}

// Un seul pool par processus, y compris en dev malgré le rechargement à chaud.
const globalForDb = globalThis as unknown as { pg?: postgres.Sql };
const client = globalForDb.pg ?? postgres(databaseUrl(), { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { client as sql };
