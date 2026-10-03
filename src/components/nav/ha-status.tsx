"use client";

import { useEffect, useState } from "react";
import { pushState } from "@/domain/ingest/push-state";

interface Props {
  lastPushAt: string | null;
  granularity: "hourly" | "daily";
  /** Heure du rendu serveur : garantit un premier rendu identique côté client. */
  renderedAt: string;
  compact?: boolean;
}

function ago(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export function HaStatus({ lastPushAt, granularity, renderedAt, compact }: Props) {
  const [now, setNow] = useState(() => Date.parse(renderedAt));
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const last = lastPushAt ? Date.parse(lastPushAt) : null;
  const state = pushState(last, now, granularity);
  const dot = { never: "bg-subtle", stale: "bg-pellet", ok: "bg-battery" }[state];
  const since = last === null ? "" : ago(now - last);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1.5 text-xs text-[#5E625C]">
        <span className={`size-[7px] rounded-full ${dot}`} />
        {state === "never" ? "HA · en attente" : `HA · ${since.replace("il y a ", "")}`}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] bg-bg/[0.06] px-3 py-3.5">
      <div className="flex items-center gap-2 text-xs text-[#A9ADA6]">
        <span className={`size-[7px] rounded-full ${dot}`} />
        {state === "never"
          ? "Home Assistant non connecté"
          : state === "stale"
            ? "Home Assistant silencieux"
            : "Home Assistant connecté"}
      </div>
      <div className="text-[11px] text-[#A9ADA6] tabular-nums">
        {state === "never" ? "En attente du premier push" : `Dernier push ${since}`}
      </div>
    </div>
  );
}
