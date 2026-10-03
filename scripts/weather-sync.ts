// `pnpm weather:sync` : jours récents pour chaque maille, ou historique complet d'une
// maille avec `--backfill <lat> <lon>`.
import { sql } from "@/db";
import { cellOf } from "@/domain/weather";
import { OpenMeteoSource } from "@/server/weather/open-meteo";
import { backfillCell, syncRecentWeather, weatherSyncEnabled } from "@/server/weather/sync";

async function main() {
  if (!weatherSyncEnabled()) {
    console.log("WEATHER_SYNC=off : aucun appel");
    return;
  }
  const source = new OpenMeteoSource();
  const [flag, lat, lon] = process.argv.slice(2);
  if (flag === "--backfill") {
    const cell = cellOf({ lat: Number(lat), lon: Number(lon) });
    await backfillCell(source, cell);
    console.log(`Historique rempli pour la maille ${cell.latE2}/${cell.lonE2}`);
  } else {
    const { cells, failed } = await syncRecentWeather(source);
    console.log(`Météo à jour : ${cells - failed.length}/${cells} mailles`);
    if (failed.length > 0) process.exitCode = 1;
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
