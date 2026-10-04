import { auth } from "../src/server/auth";
import { householdContextFor } from "../src/server/context";
import { createIngestToken } from "../src/server/ingest/token";

// Test de charge de l'ingestion (T33) : 10 000 envois horaires répartis sur 100 foyers
// (100 envois par token, sous la limite de 120 par minute), puis une rafale de 130 envois
// sur un seul token. Critères : aucune erreur 5xx, p95 < 150 ms, 429 au-delà de la limite.
// Usage : BASE_URL=http://localhost:3100 DATABASE_URL=<base du serveur> tsx scripts/load-ingest.ts

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const HOUSEHOLDS = Number(process.env.HOUSEHOLDS ?? 100);
const PUSHES_PER_TOKEN = Number(process.env.PUSHES_PER_TOKEN ?? 100);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 10);
const BURST = 130;

async function newToken(i: number) {
  const created = await auth.api.signUpEmail({
    body: {
      email: `charge-${Date.now()}-${i}@wattsup.test`,
      password: "motdepasse-de-charge",
      name: "Charge",
    },
  });
  return (await createIngestToken(await householdContextFor(created.user.id))).token;
}

async function push(token: string, hour: number) {
  const t0 = performance.now();
  const res = await fetch(`${BASE_URL}/api/v1/ingest`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      version: 1,
      ts: new Date(Date.UTC(2026, 0, 1) + hour * 3_600_000).toISOString(),
      energy: { grid_import_kwh: 1000 + hour * 0.5, solar_production_kwh: 200 + hour * 0.2 },
    }),
  });
  await res.arrayBuffer();
  return { status: res.status, ms: performance.now() - t0 };
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};

async function main() {
  console.log(`Préparation de ${HOUSEHOLDS} foyers…`);
  const tokens = await Promise.all(Array.from({ length: HOUSEHOLDS }, (_, i) => newToken(i)));

  console.log(`${HOUSEHOLDS * PUSHES_PER_TOKEN} envois sur ${BASE_URL}…`);
  const results: { status: number; ms: number }[] = [];
  let next = 0;
  const started = performance.now();
  // Chaque travailleur prend un foyer et envoie ses heures dans l'ordre.
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < tokens.length) {
        const token = tokens[next++] as string;
        for (let h = 0; h < PUSHES_PER_TOKEN; h++) results.push(await push(token, h));
      }
    }),
  );
  const seconds = (performance.now() - started) / 1000;
  const byStatus = results.reduce<Record<number, number>>(
    (a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }),
    {},
  );
  const latencies = results.map((r) => r.ms);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const errors5xx = results.filter((r) => r.status >= 500).length;
  console.log(
    `statuts : ${JSON.stringify(byStatus)} · ${(results.length / seconds).toFixed(0)} req/s`,
  );
  console.log(`latence : p50 ${p50.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms`);

  console.log(`Rafale de ${BURST} envois sur un seul token…`);
  const burstToken = await newToken(HOUSEHOLDS);
  const burst = await Promise.all(Array.from({ length: BURST }, (_, h) => push(burstToken, h)));
  const limited = burst.filter((r) => r.status === 429).length;
  console.log(`rafale : ${limited} réponses 429`);

  const ok = errors5xx === 0 && p95 < 150 && limited >= BURST - 120;
  console.log(ok ? "✓ critères remplis" : "✗ critères non remplis");
  process.exit(ok ? 0 : 1);
}

void main();
