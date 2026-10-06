"use client";

import { useState } from "react";
import { button, Card, Figures, Notice } from "@/components/ui";
import type { Forecast, Scenario } from "@/domain/heating/forecast";
import type { Fuel } from "@/domain/heating/fuel";
import { formatNumber } from "@/lib/format";
import type { FuelForecast, RefillForecastView } from "@/server/queries/heating";
import { FUEL_LABELS } from "./labels";

// Prévision de réapprovisionnement (T27) : tous les cas sont calculés côté serveur ; les
// onglets ne font que choisir le combustible, l'échéance et le scénario.

const SCENARIO_LABELS: Record<Scenario, string> = {
  doux: "Hiver doux",
  moyen: "Hiver moyen",
  rigoureux: "Hiver rigoureux",
};
const SCENARIO_FACTOR: Record<Scenario, string> = {
  doux: "0,90",
  moyen: "1,00",
  rigoureux: "1,15",
};

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-[9px] bg-chip p-[2px]"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-[7px] px-2.5 py-1 text-[12px] font-medium whitespace-nowrap ${
            value === o.id ? "bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#5E625C]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const eur = (n: number) => `${formatNumber(Math.round(n / 5) * 5)} €`;

/** Quantité lisible : sacs (granulés) ou stères (bois), depuis l'unité de base. */
function qty(fuel: Fuel, base: number, bagKg: number) {
  return fuel === "pellet"
    ? { value: formatNumber(Math.max(0, Math.ceil(base / bagKg - 1e-9))), unit: "sacs" }
    : { value: formatNumber(base, 1), unit: "stères" };
}

function Summary({
  f,
  forecast,
  target,
  bagsPerPallet,
}: {
  f: FuelForecast;
  forecast: Extract<Forecast, { status: "ok" }>;
  target: "current" | "next";
  bagsPerPallet: number;
}) {
  const label = target === "current" ? f.currentLabel : f.nextLabel;
  const goal =
    target === "current"
      ? `Pour finir la saison ${label}`
      : `Pour passer l'hiver ${label} sereinement`;
  const { order } = forecast;
  const nothing = forecast.toBuy <= 0;
  const what =
    f.fuel === "pellet"
      ? `${formatNumber(order.bags ?? 0)} sac${(order.bags ?? 0) > 1 ? "s" : ""}`
      : `${formatNumber(order.steres ?? 0, 1)} stère${(order.steres ?? 0) > 1 ? "s" : ""}`;
  // Pour qui achète à la palette : combien de palettes entières couvrent ces sacs.
  const byPallet =
    f.fuel === "pellet" && !nothing && order.pallets
      ? `À la palette : ${order.pallets} palette${order.pallets > 1 ? "s" : ""} (${formatNumber(order.pallets * bagsPerPallet)} sacs).`
      : null;
  return (
    <p className="text-[20px] leading-snug font-semibold tracking-tight text-pretty">
      {nothing ? (
        <>
          {goal}, votre stock suffit
          {target === "next" && f.currentLabel ? " (après la fin de l'hiver en cours)" : ""}.
        </>
      ) : (
        <>
          {goal}, prévoyez{" "}
          <span className={f.fuel === "pellet" ? "text-pellet" : "text-wood"}>{what}</span>
          {forecast.costEur !== null && <>, soit environ {eur(forecast.costEur)}</>}.
        </>
      )}
      {byPallet && <span className="block pt-1 text-xs font-normal text-muted">{byPallet}</span>}
      {forecast.costEur === null && !nothing && (
        <span className="block pt-1 text-xs font-normal text-muted">
          Coût inconnu : aucun achat chiffré.
        </span>
      )}
    </p>
  );
}

export function ForecastCard({ view }: { view: RefillForecastView }) {
  const [fuel, setFuel] = useState<Fuel>(view.fuels[0]?.fuel ?? "pellet");
  const first = view.fuels.find((x) => x.fuel === fuel) ?? view.fuels[0];
  const [target, setTarget] = useState<"current" | "next">(first?.current ? "current" : "next");
  const [scenario, setScenario] = useState<Scenario>("moyen");
  if (!first) return null;
  const f = first;
  const effectiveTarget = target === "current" && f.current ? "current" : "next";
  const forecast = (effectiveTarget === "current" ? f.current : f.next)?.[scenario];
  const bagKg = view.bagKg;

  return (
    <Card
      icon="sliders"
      title="Prévision de réapprovisionnement"
      description="D'après vos deux dernières saisons, corrigées du froid (degrés-jours), et votre stock actuel."
    >
      {/* Réglages de la prévision : compacts, sur une ligne, au-dessus de la réponse. */}
      <div className="flex flex-wrap gap-2">
        {view.fuels.length > 1 && (
          <Segmented
            label="Combustible"
            value={fuel}
            onChange={setFuel}
            options={view.fuels.map((x) => ({ id: x.fuel, label: FUEL_LABELS[x.fuel] }))}
          />
        )}
        {f.current && (
          <Segmented
            label="Échéance"
            value={effectiveTarget}
            onChange={setTarget}
            options={[
              { id: "current", label: "Fin de cette saison" },
              { id: "next", label: "Saison prochaine" },
            ]}
          />
        )}

        {forecast && forecast.status !== "insufficient" && (
          <span className="flex items-center gap-1.5 text-[12px] text-muted">
            Hiver
            <Segmented
              label="Scénario"
              value={scenario}
              onChange={setScenario}
              options={(Object.keys(SCENARIO_LABELS) as Scenario[]).map((s) => ({
                id: s,
                label: SCENARIO_LABELS[s].replace("Hiver ", ""),
              }))}
            />
          </span>
        )}
      </div>
      {!forecast || forecast.status === "insufficient" ? (
        <Notice
          tone="info"
          title="Données insuffisantes :"
          action={
            <a href="#consommation-passee" className={button.secondary}>
              Saisir une consommation passée
            </a>
          }
        >
          il faut au moins une saison de chauffe avec des consommations saisies (sacs versés,
          relevés de stock, ou totaux mensuels des saisons passées).
        </Notice>
      ) : (
        <>
          <Summary
            f={f}
            forecast={forecast}
            target={effectiveTarget}
            bagsPerPallet={view.bagsPerPallet}
          />
          {/* Le calcul derrière la réponse, en ligne et sans fond. */}
          <Figures
            ops={["−", "="]}
            items={[
              {
                label: effectiveTarget === "current" ? "Reste à consommer" : "Besoin de la saison",
                ...qty(
                  f.fuel,
                  effectiveTarget === "current" ? forecast.remaining : forecast.need,
                  bagKg,
                ),
              },
              {
                label:
                  effectiveTarget === "next" && f.current
                    ? "Stock après cet hiver"
                    : "Stock disponible",
                ...qty(f.fuel, forecast.stock, bagKg),
              },
              {
                label: "À acheter",
                ...qty(f.fuel, forecast.toBuy, bagKg),
                tone:
                  forecast.toBuy > 0
                    ? f.fuel === "pellet"
                      ? "text-pellet"
                      : "text-wood"
                    : "text-positive",
              },
            ]}
          />
          <details className="text-xs text-muted">
            <summary className="cursor-pointer text-[#5E625C] hover:text-ink">
              Base de calcul
            </summary>
            <p className="pt-2 text-pretty tabular-nums">
              {forecast.basis.weatherCorrected &&
              forecast.perDju !== null &&
              forecast.djuRef !== null ? (
                <>
                  Saisons {forecast.basis.seasons.join(" et ")} :{" "}
                  {f.fuel === "pellet"
                    ? `${formatNumber(forecast.perDju, 2)} kg par degré-jour`
                    : `${formatNumber(forecast.perDju * 100, 2)} stère pour 100 degrés-jours`}{" "}
                  × {formatNumber(forecast.djuRef)} degrés-jours (hiver de référence) ×{" "}
                  {SCENARIO_FACTOR[scenario]} ({SCENARIO_LABELS[scenario].toLowerCase()}).
                </>
              ) : (
                <>
                  Moyenne des saisons {forecast.basis.seasons.join(" et ")}, sans correction météo
                  (commune ou températures manquantes) × {SCENARIO_FACTOR[scenario]}.
                </>
              )}{" "}
              {f.fuel === "pellet"
                ? "Commande arrondie au sac supérieur."
                : "Commande arrondie au demi-stère."}{" "}
              {forecast.costEur !== null && "Coût au dernier prix d'achat connu."}
            </p>
          </details>
        </>
      )}
    </Card>
  );
}
