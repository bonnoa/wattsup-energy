import { localParts } from "@/lib/time";
import { OpenMeteoSource } from "./weather/open-meteo";
import { syncRecentWeather, weatherSyncEnabled } from "./weather/sync";

// Tâches quotidiennes exécutées dans le processus serveur (instance unique en V1) :
// rien à configurer côté Coolify ni en auto-hébergement. Un passage de rattrapage a lieu
// au démarrage, puis la tâche du matin tourne une fois par jour à partir de 7 h (Paris).

const TICK_MS = 15 * 60_000;
const DAILY_HOUR = 7;

let started = false;
let lastDailyRun: string | null = null;

async function runWeather(reason: string) {
  try {
    const { cells, failed } = await syncRecentWeather(new OpenMeteoSource());
    console.log(`[wattsup] météo (${reason}) : ${cells - failed.length}/${cells} mailles`);
  } catch (err) {
    console.error("[wattsup] météo : échec de la synchronisation", err);
  }
}

async function tick() {
  const now = localParts(new Date(), "Europe/Paris");
  if (now.hour < DAILY_HOUR || lastDailyRun === now.date) return;
  lastDailyRun = now.date;
  if (weatherSyncEnabled()) await runWeather("quotidienne");
}

export function startScheduler(): void {
  if (started) return;
  started = true;
  if (weatherSyncEnabled()) void runWeather("démarrage");
  setInterval(() => void tick(), TICK_MS).unref();
}
