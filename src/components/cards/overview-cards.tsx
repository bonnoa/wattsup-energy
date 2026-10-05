import Link from "next/link";
import { StackedBars } from "@/components/charts/stacked-bars";
import { CoverageBadge } from "@/components/coverage-badge";
import { Badge, button, Card, Notice, StatTile, tiles } from "@/components/ui";
import { CATEGORY_SWATCH, CategoryTile, categoryColor } from "@/components/ui/category";
import { monthLabel, shortMonth } from "@/domain/overview";
import { addDays } from "@/lib/time";
import { formatEurFromCents, formatKwh, formatNumber, formatPercent } from "@/lib/format";
import type { Overview } from "@/server/queries/overview";
import { settingsHref } from "@/lib/settings-tabs";

// Cartes de la Vue d'ensemble (T20), sur les briques partagées (SPEC §2).

type Ok = Extract<Overview, { status: "ok" }>;

const eur = (cents: number) => formatEurFromCents(cents, 0);

/** Sélecteur mois / année et navigation ‹ › (liens : la période est dans l'URL). */
export function PeriodSwitcher({ overview }: { overview: Ok }) {
  const { period, nav } = overview;
  const segment = (active: boolean) =>
    `rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium ${
      active ? "bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#5E625C]"
    }`;
  const arrow = (key: string | null, label: string, path: string) =>
    key ? (
      <Link href={`/?p=${key}`} aria-label={label} className={button.icon} scroll={false}>
        <span aria-hidden className="text-base leading-none">
          {path}
        </span>
      </Link>
    ) : (
      <span className={`${button.icon} opacity-40`} aria-hidden>
        <span className="text-base leading-none">{path}</span>
      </span>
    );
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="tablist" className="flex gap-1 rounded-[10px] bg-chip p-[3px]">
        <Link
          role="tab"
          aria-selected={period.kind === "month"}
          href={`/?p=${period.kind === "month" ? period.key : addDays(period.to, -1).slice(0, 7)}`}
          className={segment(period.kind === "month")}
          scroll={false}
        >
          Mois
        </Link>
        <Link
          role="tab"
          aria-selected={period.kind === "year"}
          href={`/?p=${period.key.slice(0, 4)}`}
          className={segment(period.kind === "year")}
          scroll={false}
        >
          Année
        </Link>
      </div>
      <div className="flex items-center gap-2">
        {arrow(nav.prev, "Période précédente", "‹")}
        <span className="min-w-32 text-center text-sm font-semibold capitalize">
          {period.label}
        </span>
        {arrow(nav.next, "Période suivante", "›")}
      </div>
      {overview.coverage !== null && (
        <CoverageBadge ratio={overview.coverage} granularity={overview.granularity} />
      )}
    </div>
  );
}

/** Budget de la période (électricité au contrat réel ; combustibles à partir de T23). */
export function BudgetCard({ overview }: { overview: Ok }) {
  const { budget, period } = overview;
  if (budget.totalCents === null) {
    return (
      <Notice
        title="Budget non chiffré :"
        action={
          <Link href="/contrats" className={button.primary}>
            Ajouter mon contrat
          </Link>
        }
      >
        aucun contrat d&apos;électricité n&apos;est enregistré. Ajoutez votre contrat actuel avec sa
        date de début pour calculer ce que vous payez.
      </Notice>
    );
  }
  const delta =
    budget.previousCents && budget.previousCents > 0
      ? budget.totalCents / budget.previousCents - 1
      : null;
  // Écart en euros ; les centimes seulement sous 10 €, sinon « +0 € » pour un petit écart.
  const gap = Math.abs(budget.totalCents - (budget.previousCents ?? 0));
  // Période en cours : comparée aux mêmes jours de l'année précédente.
  const previousYear = Number(period.key.slice(0, 4)) - 1;
  const previousLabel = !period.complete
    ? `même période ${previousYear}`
    : period.kind === "month"
      ? monthLabel(`${previousYear}${period.key.slice(4)}`)
      : String(previousYear);
  return (
    <section className="flex flex-col gap-4 rounded-card bg-ink p-5 text-bg sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] text-[#A9ADA6]">
          Budget énergie · <span className="capitalize">{period.label}</span>
        </h2>
        {delta !== null && (
          <span
            className={`text-xs font-medium tabular-nums ${delta <= 0 ? "text-[#7FD1B0]" : "text-[#F2A091]"}`}
          >
            {delta <= 0 ? "−" : "+"}
            {formatEurFromCents(gap, gap < 1000 ? 2 : 0)} · {delta <= 0 ? "−" : "+"}
            {formatPercent(Math.abs(delta))} vs {previousLabel}
          </span>
        )}
      </div>
      <p className="text-[40px] leading-none font-semibold tracking-tight tabular-nums">
        {eur(budget.totalCents)}
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[#C9CCC5]">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-[#7E9CC4]" />
          Électricité consommée
          <span className="font-semibold text-bg tabular-nums">{eur(budget.energyCents)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-[#8A8E86]" />
          Abonnement
          <span className="font-semibold text-bg tabular-nums">
            {eur(budget.subscriptionCents)}
          </span>
        </span>
      </div>
      {budget.unknownContractDays > 0 && (
        <p className="text-[11px] text-[#A9ADA6]">
          {budget.unknownContractDays} jour{budget.unknownContractDays > 1 ? "s" : ""} sans contrat
          souscrit, estimé{budget.unknownContractDays > 1 ? "s" : ""} au tarif de votre contrat
          actuel.
        </p>
      )}
    </section>
  );
}

/** Chiffres clés de la période, selon le profil. */
export function KpiTiles({
  overview,
  solar,
  battery,
}: {
  overview: Ok;
  solar: boolean;
  battery: boolean;
}) {
  const b = overview.balance;
  return (
    <div className="grid grid-cols-2 gap-2 sm:auto-rows-fr">
      <StatTile
        standalone
        label="Consommation du foyer"
        value={formatNumber(b.consumption)}
        unit="kWh"
      />
      <StatTile
        standalone
        label="Soutiré au réseau"
        value={formatNumber(b.gridImport)}
        unit="kWh"
        dot="bg-grid"
        sub={
          b.consumption > 0
            ? `${formatPercent(b.origin.grid / b.consumption)} de la conso`
            : undefined
        }
      />
      {solar && (
        <StatTile
          standalone
          label="Production solaire"
          value={formatNumber(b.solar)}
          unit="kWh"
          dot="bg-solar"
          sub={
            b.selfConsumptionRate !== null
              ? `${formatPercent(b.selfConsumptionRate)} consommée sur place`
              : undefined
          }
        />
      )}
      {battery && (
        <StatTile
          standalone
          label="Restitué par la batterie"
          value={formatNumber(b.batteryDischarge)}
          unit="kWh"
          dot="bg-battery"
          sub={`chargée ${formatKwh(b.batteryCharge)}`}
        />
      )}
    </div>
  );
}

/** D'où vient l'énergie consommée : réseau, solaire direct, batterie. */
export function OriginCard({
  overview,
  solar,
  battery,
}: {
  overview: Ok;
  solar: boolean;
  battery: boolean;
}) {
  const b = overview.balance;
  const parts = [
    { label: "Réseau", kwh: b.origin.grid, color: "bg-grid" },
    ...(solar ? [{ label: "Solaire autoconsommé", kwh: b.origin.solar, color: "bg-solar" }] : []),
    ...(battery ? [{ label: "Batterie", kwh: b.origin.battery, color: "bg-battery" }] : []),
  ];
  const total = b.consumption;
  return (
    <Card
      title="Origine de la consommation"
      badges={<Badge>{formatKwh(total)}</Badge>}
      description={overview.period.label}
    >
      {total > 0 ? (
        <>
          <div className="flex h-9 gap-[2px] overflow-hidden rounded-[8px]" aria-hidden>
            {parts
              .filter((p) => p.kwh > 0)
              .map((p) => (
                <div
                  key={p.label}
                  className={p.color}
                  style={{ width: `${(p.kwh / total) * 100}%` }}
                  title={`${p.label} : ${formatPercent(p.kwh / total)}`}
                />
              ))}
          </div>
          <ul className="flex flex-col gap-2.5 text-[13px]">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[#5E625C]">
                  <span className={`size-2 rounded-[2px] ${p.color}`} />
                  {p.label}
                </span>
                <span className="tabular-nums">
                  <span className="font-semibold">{formatPercent(p.kwh / total)}</span>
                  <span className="text-subtle"> · {formatKwh(p.kwh)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted">Aucune consommation sur cette période.</p>
      )}
    </Card>
  );
}

/** Postes de consommation : kWh de la période et part de la consommation du foyer. */
export function CategoriesOverviewCard({ overview }: { overview: Ok }) {
  const { categories, balance, period } = overview;
  const max = Math.max(...categories.map((c) => c.kwh), 0);
  return (
    <Card
      title="Postes de consommation"
      description={period.label}
      actions={
        <Link href={settingsHref("postes")} className={`${button.link} pt-0.5`}>
          Gérer
        </Link>
      }
    >
      {categories.length === 0 ? (
        <Notice
          tone="info"
          title="Aucun poste suivi."
          action={
            <Link href={settingsHref("postes")} className={button.secondary}>
              Créer un poste
            </Link>
          }
        >
          Suivez un appareil ou un circuit (chauffe-eau, chauffage, véhicule…) pour voir sa part
          dans votre consommation.
        </Notice>
      ) : (
        <ul className="flex flex-col gap-3">
          {[...categories]
            .sort((a, b) => b.kwh - a.kwh)
            .map((c) => {
              return (
                <li key={c.id} className="flex items-center gap-3">
                  <CategoryTile icon={c.icon} color={c.color} size="sm" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{c.name}</span>
                        {c.isHeating && <Badge tone="warning">Chauffage</Badge>}
                      </span>
                      <span className="flex-none tabular-nums">
                        <span className="font-semibold">{formatKwh(c.kwh)}</span>
                        {balance.consumption > 0 && (
                          <span className="text-subtle">
                            {" "}
                            · {formatPercent(c.kwh / balance.consumption)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-track">
                      <div
                        className={`h-1 rounded-full ${CATEGORY_SWATCH[categoryColor(c.color)].bg}`}
                        style={{ width: max > 0 ? `${(c.kwh / max) * 100}%` : 0 }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </Card>
  );
}

const fmtHours = (h: number) =>
  `${h.toLocaleString("fr-FR", { maximumFractionDigits: h < 10 ? 1 : 0 })} h`;
const fmtYield = (y: number) => y.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

// Couleur de la courbe d'ensoleillement (et de son repère dans la tuile).
const SUNSHINE = "#5E625C";

/**
 * Production et ensoleillement : barres de production et courbe d'ensoleillement superposée
 * (chacune sur sa propre échelle, dont la valeur du haut est indiquée de chaque côté ;
 * valeurs dans l'info-bulle), et le rendement kWh produits
 * par kWh/m² reçu, comparé à N-1.
 */
export function SolarCard({ overview }: { overview: Ok }) {
  const { solar, period } = overview;
  if (!solar) return null;
  const byMonth = period.kind === "year";
  const label = (key: string, i: number) =>
    byMonth ? shortMonth(key) : i % 7 === 0 ? String(Number(key.slice(8))) : "";
  const pointTitle = (key: string) =>
    byMonth
      ? monthLabel(key)
      : new Date(`${key}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const sunshine = solar.points.reduce((a, p) => a + (p.sunshineHours ?? 0), 0);
  const maxKwh = Math.max(...solar.points.map((p) => p.kwh), 0);
  const maxSunshine = Math.max(...solar.points.map((p) => p.sunshineHours ?? 0), 0);
  const delta =
    solar.yield !== null && solar.previousYield ? solar.yield / solar.previousYield - 1 : null;
  return (
    <Card
      icon="sun"
      title="Production et ensoleillement"
      description={<span className="capitalize">{period.label}</span>}
    >
      <div className={tiles}>
        <StatTile label="Production" value={formatNumber(solar.kwh)} unit="kWh" dot="bg-solar" />
        <StatTile
          label="Ensoleillement"
          value={formatNumber(sunshine)}
          unit="h"
          dot="bg-[#5E625C]"
        />
        <StatTile
          label="Rendement"
          value={solar.yield !== null ? fmtYield(solar.yield) : "—"}
          unit="kWh par kWh/m²"
          sub={
            delta !== null
              ? `${delta >= 0 ? "+" : "−"}${formatPercent(Math.abs(delta))} vs l'an dernier`
              : "pas de comparaison N-1"
          }
        />
      </div>
      {solar.noLocation && (
        <Notice
          tone="info"
          title="Pas de météo :"
          action={
            <Link href={settingsHref("localisation")} className={button.secondary}>
              Renseigner ma commune
            </Link>
          }
        >
          renseignez votre commune pour mettre la production en regard de l&apos;ensoleillement.
        </Notice>
      )}
      {solar.kwh === 0 ? (
        <p className="text-sm text-muted">
          Aucune production solaire reçue sur cette période. Vérifiez que le capteur de production
          est bien renseigné dans l&apos;automatisation Home Assistant.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-solar" />
              Production (kWh)
            </span>
            {!solar.noLocation && (
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full" style={{ background: SUNSHINE }} />
                Ensoleillement (h)
              </span>
            )}
          </div>
          {/* Valeur du haut de chaque échelle : barres à gauche, courbe à droite. */}
          <div className="-mb-1 flex justify-between text-[10px] text-subtle tabular-nums">
            <span>{formatKwh(maxKwh, maxKwh < 10 ? 1 : 0)}</span>
            {!solar.noLocation && maxSunshine > 0 && <span>{fmtHours(maxSunshine)}</span>}
          </div>
          <StackedBars
            height={140}
            ariaLabel={`Production solaire et ensoleillement ${byMonth ? "par mois" : "par jour"}, ${period.label}`}
            bars={solar.points.map((p, i) => ({
              key: p.key,
              label: label(p.key, i),
              title: `${pointTitle(p.key)} : ${formatKwh(p.kwh, p.kwh < 10 ? 1 : 0)}${
                solar.noLocation || p.sunshineHours === null
                  ? ""
                  : ` · ${fmtHours(p.sunshineHours)} de soleil`
              }`,
              segments: [{ value: p.kwh, color: "bg-solar", label: "Production" }],
            }))}
            line={
              solar.noLocation
                ? undefined
                : { values: solar.points.map((p) => p.sunshineHours), color: SUNSHINE }
            }
          />
        </div>
      )}
    </Card>
  );
}
