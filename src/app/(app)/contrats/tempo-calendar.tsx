"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TempoColor } from "@/domain/tariff/types";
import { setTempoColorAction } from "@/server/actions/contracts";

export interface CalendarDay {
  date: string;
  color: TempoColor | null;
  source: "manual" | "ha" | "community" | "seed" | null;
}

const COLOR_CLASS: Record<TempoColor, string> = {
  bleu: "bg-grid",
  blanc: "bg-[#E4E0D6]",
  rouge: "bg-eheat",
};
const SOURCE_LABEL = {
  manual: "corrigée à la main",
  ha: "envoyée par Home Assistant",
  community: "calendrier Tempo",
  seed: "historique intégré",
} as const;

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
const monthLabel = (ym: string) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "short" });
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

export function TempoCalendar({ season, days }: { season: string; days: CalendarDay[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [pending, startTransition] = useTransition();

  const months = new Map<string, CalendarDay[]>();
  for (const d of days) {
    const list = months.get(d.date.slice(0, 7)) ?? [];
    list.push(d);
    months.set(d.date.slice(0, 7), list);
  }
  const counts = { bleu: 0, blanc: 0, rouge: 0 };
  for (const d of days) if (d.color) counts[d.color] += 1;

  const choose = (color: TempoColor | null) => {
    if (!selected) return;
    startTransition(async () => {
      await setTempoColorAction(selected.date, color);
      setSelected(null);
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">
          Calendrier Tempo · saison {season.replace("-", "–")}
        </h2>
        <span className="text-[11px] text-subtle tabular-nums">
          {plural(counts.blanc, "blanc")} · {plural(counts.rouge, "rouge")} (sur 43 et 22)
        </span>
      </div>
      {/* Pas de 24 px entre les cases : cible tactile suffisante sans agrandir les carrés. */}
      <div className="flex flex-col gap-2.5">
        {[...months].map(([ym, list]) => (
          <div key={ym} className="flex items-start gap-2">
            <span className="w-9 flex-none text-[11px] leading-[14px] text-subtle">
              {monthLabel(ym)}
            </span>
            <div className="flex flex-wrap gap-2.5">
              {list.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setSelected(d)}
                  title={`${dayLabel(d.date)} : ${d.color ?? "inconnue"}${d.source ? ` (${SOURCE_LABEL[d.source]})` : ""}`}
                  aria-label={`${dayLabel(d.date)}, ${d.color ?? "couleur inconnue"}`}
                  className={`size-3.5 rounded-[3px] ${d.color ? COLOR_CLASS[d.color] : "border border-dashed border-[#CFC9BB]"} ${
                    d.source === "manual" ? "ring-2 ring-ink ring-offset-1" : ""
                  } ${selected?.date === d.date ? "outline-2 outline-pellet" : ""}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected ? (
        <div className="flex flex-col gap-2 rounded-[10px] bg-bg p-3">
          <span className="text-[13px]">
            <span className="font-medium">{dayLabel(selected.date)}</span>
            <span className="text-muted">
              {" "}
              · {selected.color ?? "couleur inconnue"}
              {selected.source ? ` (${SOURCE_LABEL[selected.source]})` : ""}
            </span>
          </span>
          <div className="flex flex-wrap gap-2">
            {(["bleu", "blanc", "rouge"] as const).map((c) => (
              <button
                key={c}
                type="button"
                disabled={pending}
                onClick={() => choose(c)}
                className="flex items-center gap-1.5 rounded-[8px] border border-border-strong bg-surface px-2.5 py-1.5 text-xs capitalize hover:bg-bg"
              >
                <span className={`size-2.5 rounded-[3px] ${COLOR_CLASS[c]}`} />
                {c}
              </button>
            ))}
            {selected.source === "manual" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => choose(null)}
                className="rounded-[8px] px-2.5 py-1.5 text-xs text-negative hover:bg-surface"
              >
                Retirer la correction
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-[8px] px-2.5 py-1.5 text-xs text-muted hover:bg-surface"
            >
              Fermer
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-subtle">
          Couleurs récupérées automatiquement chaque jour. Touchez un jour pour le corriger ; un
          jour entouré a été corrigé à la main.
        </p>
      )}
    </section>
  );
}
