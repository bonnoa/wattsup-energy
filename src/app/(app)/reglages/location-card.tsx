"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { CommuneResult } from "@/domain/weather";
import { searchCommunesAction, setLocationAction } from "@/server/actions/location";

interface Status {
  location: { label: string; lat: number; lon: number };
  lastDate: string | null;
  days: number;
}

const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
const fmtCoord = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2 });

const inputClass =
  "h-10 min-w-0 flex-1 rounded-[8px] border border-border-strong bg-surface px-3 text-[13px] outline-none focus:border-ink";
const darkButton =
  "flex h-10 flex-none items-center rounded-[8px] bg-ink px-3.5 text-[13px] font-medium text-bg disabled:opacity-60";

export function LocationCard({ status }: { status: Status | null }) {
  const [editing, setEditing] = useState(status === null);
  const [results, setResults] = useState<CommuneResult[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const search = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const query = String(new FormData(e.currentTarget).get("q") ?? "");
    setMessage(null);
    startTransition(async () => setResults(await searchCommunesAction(query)));
  };

  const choose = (commune: CommuneResult) => {
    setMessage("Récupération de l'historique météo…");
    startTransition(async () => {
      const res = await setLocationAction(commune);
      if (!res.ok) return setMessage("Enregistrement impossible. Réessayez.");
      setResults(null);
      setEditing(false);
      setMessage(
        res.weather === "pending"
          ? "Commune enregistrée. La météo sera récupérée lors de la prochaine synchronisation."
          : null,
      );
    });
  };

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
      <h2 className="text-[15px] font-semibold">Localisation</h2>
      <p className="text-xs text-subtle">
        Pour la météo (température, ensoleillement), récupérée chaque jour auprès d&apos;Open-Meteo.
        Seules des coordonnées arrondies à 1 km environ sont transmises.
      </p>

      {status && !editing && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{status.location.label}</span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-grid hover:text-ink"
            >
              Modifier
            </button>
          </div>
          <div className="flex justify-between gap-2 font-mono text-[11px] text-muted">
            <span>
              {fmtCoord(status.location.lat)} · {fmtCoord(status.location.lon)}
            </span>
            <span>
              {status.lastDate
                ? `${status.days} jours · jusqu'au ${fmtDate(status.lastDate)}`
                : "météo en attente"}
            </span>
          </div>
        </div>
      )}

      {editing && (
        <>
          <form onSubmit={search} className="flex gap-2">
            <input
              name="q"
              required
              minLength={2}
              placeholder="Votre commune, ex. Vigneux-de-Bretagne"
              className={inputClass}
              autoComplete="address-level2"
            />
            <button type="submit" disabled={pending} className={darkButton}>
              Chercher
            </button>
          </form>
          {results && results.length === 0 && (
            <p className="text-sm text-muted">Aucune commune trouvée.</p>
          )}
          {results && results.length > 0 && (
            <ul className="flex flex-col">
              {results.map((r) => (
                <li key={`${r.label}-${r.lat}-${r.lon}`}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => choose(r)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 border-t border-track py-2 text-left text-sm hover:bg-bg disabled:opacity-60"
                  >
                    <span>{r.label}</span>
                    <span className="font-mono text-[11px] text-subtle">{r.country}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {status && (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setResults(null);
              }}
              className="self-start text-xs text-muted hover:text-ink"
            >
              Annuler
            </button>
          )}
        </>
      )}

      {message && (
        <p role="status" className="text-xs text-pellet">
          {message}
        </p>
      )}
    </section>
  );
}
