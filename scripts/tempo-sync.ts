// `pnpm tempo:sync` : charge le seed Tempo puis récupère les couleurs manquantes.
import { sql } from "@/db";
import { CommunityTempoSource } from "@/server/tempo/community";
import { loadTempoSeed, syncTempo, tempoSyncEnabled } from "@/server/tempo/sync";

async function main() {
  if (!tempoSyncEnabled()) {
    console.log("TEMPO_SYNC=off : seed seulement");
    console.log(`Seed : ${await loadTempoSeed()} jours`);
    return;
  }
  console.log(`Seed : ${await loadTempoSeed()} jours`);
  const { seasons, days, failed } = await syncTempo(new CommunityTempoSource());
  console.log(`Saisons ${seasons.join(", ")} : ${days} jours récupérés`);
  if (failed.length > 0) {
    console.error(`Saisons en échec : ${failed.join(", ")}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
