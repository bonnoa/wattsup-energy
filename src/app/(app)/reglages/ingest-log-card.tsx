import { Badge, Card } from "@/components/ui";
import { describeLogError, describeWarnings } from "@/domain/ingest/describe";

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

/** Journal des 20 derniers envois de Home Assistant, pour diagnostiquer une liaison. */
export function IngestLogCard({
  entries,
  timezone,
  categoryNames,
}: {
  entries: LogEntry[];
  timezone: string;
  /** Nom de chaque poste par slug, pour les avertissements. */
  categoryNames: Record<string, string>;
}) {
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
            const lines = e.error
              ? describeLogError(e.error).map((text) => ({ tone: "warning" as const, text }))
              : describeWarnings(e.warnings, categoryNames);
            return (
              <li
                key={e.id}
                className="flex flex-col gap-1 border-t border-track py-2 first:border-t-0"
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
                {lines.length > 0 && (
                  <ul className="flex flex-col gap-0.5 text-xs text-pretty">
                    {lines.map((l) => (
                      <li
                        key={l.text}
                        className={l.tone === "warning" ? "text-[#9A5322]" : "text-muted"}
                      >
                        {l.text}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
