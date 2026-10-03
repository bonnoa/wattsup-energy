// `pnpm db:seed` : crée ou remplace le foyer de démo (identifiants DEMO_EMAIL /
// DEMO_PASSWORD, voir .env.example). Refusé en production sauf `--force`.
import { sql } from "@/db";
import { seedDemo } from "./seed/seed";

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    throw new Error("seed refusé en production (ajouter --force pour passer outre)");
  }
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) throw new Error("DEMO_EMAIL et DEMO_PASSWORD requis (.env.local)");
  const started = Date.now();
  const r = await seedDemo({ email, password });
  console.log(
    `Foyer démo ${r.householdId} : ${r.hours} heures (${r.from} → ${r.to}), ${r.intervals} intervalles, ${Math.round((Date.now() - started) / 100) / 10} s`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
