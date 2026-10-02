import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Connexion créée au premier usage : `next build` importe les modules sans base
// disponible, et DATABASE_URL n'est exigée qu'à l'exécution.

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante (voir .env.example)");
  const client = postgres(url, { max: 10, onnotice: () => {} });
  return { client, db: drizzle(client, { schema }) };
}

type Instance = ReturnType<typeof create>;

// Un seul pool par processus, y compris en dev malgré le rechargement à chaud.
const globalForDb = globalThis as unknown as { wattsupDb?: Instance };

function instance(): Instance {
  globalForDb.wattsupDb ??= create();
  return globalForDb.wattsupDb;
}

export type Db = Instance["db"];

export const db = new Proxy({} as Db, {
  get: (_target, prop) => Reflect.get(instance().db, prop, instance().db),
});

/** Client postgres brut (fermeture de pool dans les scripts, requêtes de santé). */
// Cible fonction : le client s'utilise aussi comme template tagué (sql`select 1`).
export const sql = new Proxy((() => {}) as unknown as postgres.Sql, {
  get: (_target, prop) => Reflect.get(instance().client, prop, instance().client),
  apply: (_target, _this, args: Parameters<postgres.Sql>) => instance().client(...args),
});
