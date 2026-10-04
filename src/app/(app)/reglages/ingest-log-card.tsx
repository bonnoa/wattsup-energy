import { Badge, Card } from "@/components/ui";

export interface LogEntry {
  id: string;
  /** ISO. */
  receivedAt: string;
  httpStatus: number;
  mode: "hourly" | "daily" | null;
  payloadSize: number;
  warnings: unknown[];
  error: string | null;
}

const STATUS: Record<number, string> = {
  200: "Accepté",
  400: "Invalide",
  401: "Token refusé",
  409: "Mauvais mode",
  413: "Trop volumineux",
  429: "Trop d'envois",
};

const warningCodes = (w: unknown[]) =>
  [
    ...new Set(
      w.flatMap((x) =>
        typeof x === "object" && x !== null && "code" in x && typeof x.code === "string"
          ? [x.code]
          : [],
      ),
    ),
  ].join(", ");

/** Journal des 20 derniers envois de Home Assistant, pour diagnostiquer une liaison. */
export function IngestLogCard({ entries, timezone }: { entries: LogEntry[]; timezone: string }) {
  const when = (iso: string) =>
    new Date(iso).toLocaleString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: timezone,
    });
  return (
    <Card
      title="Derniers envois"
      description="Les 20 derniers envois reçus de Home Assistant, acceptés ou refusés."
    >
      {entries.length === 0 ? (
        <p className="text-sm text-muted">Aucun envoi reçu pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col">
          {entries.map((e) => {
            const warnings = warningCodes(e.warnings);
            return (
              <li
                key={e.id}
                className="flex flex-col gap-0.5 border-t border-track py-2 first:border-t-0"
              >
                <span className="flex flex-wrap items-center gap-2 text-[13px]">
                  <Badge tone={e.httpStatus === 200 ? "positive" : "warning"}>
                    {STATUS[e.httpStatus] ?? `HTTP ${e.httpStatus}`}
                  </Badge>
                  <span className="tabular-nums">{when(e.receivedAt)}</span>
                  {e.mode && (
                    <span className="text-xs text-subtle">
                      {e.mode === "hourly" ? "horaire" : "quotidien"}
                    </span>
                  )}
                </span>
                {(e.error || warnings) && (
                  <span className="text-[11px] text-muted text-pretty">
                    {e.error ?? `avertissements : ${warnings}`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
