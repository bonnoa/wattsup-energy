// État de la liaison Home Assistant, d'après la date du dernier push accepté. Un push est
// « en retard » au-delà de 2 h (envoi horaire) ou 26 h (envoi quotidien).

export type PushState = "never" | "stale" | "ok";

const STALE_MS = { hourly: 2 * 3_600_000, daily: 26 * 3_600_000 };

export function pushState(
  lastPushMs: number | null,
  nowMs: number,
  granularity: "hourly" | "daily",
): PushState {
  if (lastPushMs === null) return "never";
  return nowMs - lastPushMs > STALE_MS[granularity] ? "stale" : "ok";
}
