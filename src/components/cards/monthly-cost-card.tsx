"use client";

import { useEffect, useState } from "react";
import { StackedBars } from "@/components/charts/stacked-bars";
import { Card } from "@/components/ui";
import { monthLabel, shortMonth, type Period } from "@/domain/overview";
import { formatEurFromCents, formatKwh } from "@/lib/format";
import type { MonthCost } from "@/server/queries/overview";

// Électricité mois par mois, en euros (abonnement en bas de chaque barre) ou en kWh
// soutirés ; chaque barre ouvre le mois. Le choix de l'unité est mémorisé sur l'appareil.

type Unit = "eur" | "kwh";
const STORAGE_KEY = "wattsup:monthly-unit";
const SUBSCRIPTION = "bg-[#C9C2B4]";

const eur = (cents: number) => formatEurFromCents(cents, 0);
const kwh = (value: number) => formatKwh(value);

function UnitSwitch({ unit, onChange }: { unit: Unit; onChange: (u: Unit) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Unité du graphique"
      className="flex gap-1 rounded-[10px] bg-chip p-[3px]"
    >
      {(
        [
          { id: "eur", label: "€" },
          { id: "kwh", label: "kWh" },
        ] as const
      ).map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={unit === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-[8px] px-3 py-1 text-[13px] font-medium ${
            unit === o.id ? "bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#5E625C]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-[#5E625C]">
        <span className={`size-2 rounded-[2px] ${color}`} />
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function MonthlyCostCard({ months, period }: { months: MonthCost[]; period: Period }) {
  const [unit, setUnit] = useState<Unit>("eur");
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "kwh") setUnit("kwh");
    } catch {
      // stockage indisponible : euros par défaut
    }
  }, []);
  const choose = (u: Unit) => {
    setUnit(u);
    try {
      localStorage.setItem(STORAGE_KEY, u);
    } catch {
      // choix non mémorisé
    }
  };

  const year = period.key.slice(0, 4);
  const selected = period.kind === "month" ? months.find((m) => m.key === period.key) : null;
  const sum = (pick: (m: MonthCost) => number) =>
    selected ? pick(selected) : months.reduce((a, m) => a + pick(m), 0);
  const totals = {
    energy: sum((m) => m.energyCents),
    subscription: sum((m) => m.subscriptionCents),
    kwh: sum((m) => m.kwh),
  };
  const isEur = unit === "eur";

  return (
    <Card
      title={
        isEur
          ? `Coût mensuel de l'électricité · ${year}`
          : `Électricité soutirée par mois · ${year}`
      }
      description={
        isEur
          ? "Contrat et prix en vigueur chaque jour, abonnement compris. Touchez un mois pour le détail."
          : "Énergie achetée au réseau. Touchez un mois pour le détail."
      }
      actions={<UnitSwitch unit={unit} onChange={choose} />}
    >
      <div className="flex flex-wrap items-stretch gap-5">
        <div className="min-w-0 flex-[1_1_320px]">
          <StackedBars
            ariaLabel={
              isEur
                ? `Coût de l'électricité par mois en ${year}`
                : `Électricité soutirée au réseau par mois en ${year}`
            }
            bars={months.map((m) => ({
              key: m.key,
              label: shortMonth(m.key),
              href: `/?p=${m.key}`,
              selected: period.kind === "month" && m.key === period.key,
              title: `${monthLabel(m.key)} : ${isEur ? eur(m.energyCents + m.subscriptionCents) : kwh(m.kwh)}`,
              segments: isEur
                ? [
                    { value: m.subscriptionCents, color: SUBSCRIPTION, label: "Abonnement" },
                    { value: m.energyCents, color: "bg-grid", label: "Consommation" },
                  ]
                : [{ value: m.kwh, color: "bg-grid", label: "Soutiré" }],
            }))}
          />
        </div>
        <div className="flex grow basis-[220px] flex-col gap-2.5 rounded-control bg-bg p-4 text-[13px] md:grow-0">
          <h3 className="font-semibold capitalize">{period.label}</h3>
          {isEur ? (
            <>
              <Row color="bg-grid" label="Consommation" value={eur(totals.energy)} />
              <Row color={SUBSCRIPTION} label="Abonnement" value={eur(totals.subscription)} />
              <div className="mt-auto flex justify-between border-t border-border-strong pt-2.5 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{eur(totals.energy + totals.subscription)}</span>
              </div>
            </>
          ) : (
            <>
              <Row color="bg-grid" label="Soutiré au réseau" value={kwh(totals.kwh)} />
              {totals.kwh > 0 && totals.energy > 0 && (
                <div className="mt-auto flex justify-between gap-3 border-t border-border-strong pt-2.5">
                  <span className="text-[#5E625C]">Prix moyen du kWh, hors abonnement</span>
                  <span className="font-semibold whitespace-nowrap tabular-nums">
                    {formatEurFromCents(totals.energy / totals.kwh, 3)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
