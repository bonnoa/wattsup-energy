"use client";

import { useState, useTransition } from "react";
import {
  createIngestTokenAction,
  revokeIngestTokenAction,
  setGranularityAction,
} from "@/server/actions/ingest-token";

interface ActiveToken {
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

type Granularity = "hourly" | "daily";

interface Props {
  endpoint: string;
  active: ActiveToken | null;
  granularity: Granularity;
}

const MODES: { id: Granularity; label: string; help: string }[] = [
  {
    id: "hourly",
    label: "Horaire",
    help: "HA envoie ses index cumulés chaque heure. Simulation exacte de tous les contrats.",
  },
  {
    id: "daily",
    label: "Quotidien",
    help: "HA envoie une fois par jour les kWh HP et HC de la veille. Les contrats aux plages creuses différentes sont simulés de façon approchée.",
  },
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

const mono = "font-mono text-xs bg-bg rounded-[8px] px-3 py-2.5";
const darkButton =
  "flex min-h-10 flex-none items-center rounded-[8px] bg-ink px-3.5 text-[13px] font-medium text-bg disabled:opacity-60";
const lightButton =
  "flex min-h-10 flex-none items-center rounded-[8px] border border-border-strong px-3.5 text-[13px] text-[#5E625C] hover:bg-bg disabled:opacity-60";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={darkButton}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? "Copié" : "Copier"}
    </button>
  );
}

export function IngestCard({ endpoint, active, granularity }: Props) {
  const [fresh, setFresh] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState(granularity);

  const chooseMode = (next: Granularity) => {
    if (next === mode) return;
    const previous = mode;
    setMode(next);
    startTransition(async () => {
      const res = await setGranularityAction(next);
      if (!res.ok) setMode(previous);
    });
  };

  const generate = () => {
    if (active && !confirm("Régénérer le token ? L'ancien cessera immédiatement de fonctionner."))
      return;
    startTransition(async () => {
      const created = await createIngestTokenAction();
      setFresh(created.token);
    });
  };

  const revoke = () => {
    if (!confirm("Révoquer le token ? Home Assistant ne pourra plus envoyer de données.")) return;
    startTransition(async () => {
      await revokeIngestTokenAction();
      setFresh(null);
    });
  };

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
      <h2 className="text-[15px] font-semibold">API d&apos;ingestion</h2>
      <p className="text-xs text-subtle">
        Home Assistant pousse les données. Aucun port entrant à ouvrir.
      </p>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">Granularité des envois</span>
        <div role="radiogroup" className="flex gap-1 rounded-[10px] bg-chip p-[3px]">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => chooseMode(m.id)}
              className={`flex-1 rounded-[8px] px-3 py-2 text-[13px] font-medium ${
                mode === m.id ? "bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : ""
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-subtle">{MODES.find((m) => m.id === mode)?.help}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">Endpoint</span>
        <div className="flex gap-2">
          <div className={`${mono} min-w-0 flex-1 break-all`}>POST {endpoint}</div>
          <CopyButton value={endpoint} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">Token</span>
        {fresh ? (
          <>
            <div className="flex gap-2">
              <div className={`${mono} min-w-0 flex-1 break-all`}>{fresh}</div>
              <CopyButton value={fresh} />
            </div>
            <p role="status" className="text-xs text-pellet">
              Copiez-le maintenant : il ne sera plus jamais affiché. Collez-le dans le secrets.yaml
              de Home Assistant.
            </p>
          </>
        ) : active ? (
          <div className={`${mono} truncate`}>{active.prefix}••••••••••••</div>
        ) : (
          <p className="text-sm text-muted">Aucun token actif.</p>
        )}
      </div>

      {active && (
        <div className="flex justify-between gap-2 font-mono text-[11px] text-muted">
          <span>créé le {fmt(active.createdAt)}</span>
          <span>
            {active.lastUsedAt ? `dernier usage ${fmt(active.lastUsedAt)}` : "jamais utilisé"}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={generate} disabled={pending} className={darkButton}>
          {active ? "Régénérer le token" : "Générer un token"}
        </button>
        {active && (
          <button type="button" onClick={revoke} disabled={pending} className={lightButton}>
            Révoquer
          </button>
        )}
      </div>
    </section>
  );
}
