import { Badge } from "@/components/ui";
import type { ContractComparison } from "@/server/queries/contracts";
import { KIND_LABELS } from "./labels";

const eur = (cents: number) => `${Math.round(cents / 100).toLocaleString("fr-FR")} €`;
const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

type Ok = Extract<ContractComparison, { status: "ok" }>;

export function ComparisonEmpty({ comparison }: { comparison: Exclude<ContractComparison, Ok> }) {
  return (
    <section className="flex flex-col gap-2 rounded-card border border-dashed border-[#CFC9BB] bg-surface p-5 text-sm text-muted">
      <h2 className="text-[15px] font-semibold text-ink">Comparaison des contrats</h2>
      {comparison.status === "no-data" ? (
        <p>
          Aucune consommation reçue sur les 12 derniers mois. Connectez Home Assistant (Réglages ›
          API d&apos;ingestion) ou importez votre historique.
        </p>
      ) : (
        <p>
          {comparison.days} jour{comparison.days > 1 ? "s" : ""} de données pour l&apos;instant : la
          comparaison s&apos;affiche à partir de 7 jours.
        </p>
      )}
    </section>
  );
}

export function ComparisonBanner({ comparison }: { comparison: Ok }) {
  const best = comparison.rows[0];
  const current = comparison.rows.find((r) => r.isCurrent);
  if (!best) return null;
  const partial = comparison.periodDays < 365;
  const saving = current && best.id !== current.id ? current.annualCents - best.annualCents : 0;

  return (
    <section className="flex flex-col gap-1.5 rounded-card bg-ink p-5 text-bg">
      <span className="text-[13px] text-[#A9ADA6]">
        Contrat le plus économique sur{" "}
        {partial ? `${comparison.periodDays} jours de données` : "12 mois réels"}
      </span>
      <p className="text-[22px] leading-snug font-semibold tracking-tight text-pretty">
        {!current ? (
          <>
            {best.name} :{" "}
            <span className="text-[#7FD1B0] tabular-nums">{eur(best.annualCents)}/an</span>
          </>
        ) : saving > 0 ? (
          <>
            {best.name} : <span className="text-[#7FD1B0] tabular-nums">−{eur(saving)}/an</span> par
            rapport à votre contrat actuel
          </>
        ) : (
          <>Votre contrat actuel est déjà le moins cher des offres comparées</>
        )}
      </p>
      <span className="text-xs text-[#A9ADA6] tabular-nums">
        {fmtDate(comparison.from)} – {fmtDate(comparison.to)} ·{" "}
        {Math.round(comparison.kwh).toLocaleString("fr-FR")} kWh soutirés
        {comparison.redDays > 0 ? ` · ${comparison.redDays} jours rouges` : ""}
        {partial ? " · coûts annualisés" : ""}
      </span>
    </section>
  );
}

export function ComparisonList({ comparison }: { comparison: Ok }) {
  const max = Math.max(...comparison.rows.map((r) => r.annualCents), 1);
  const best = comparison.rows[0];
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Coût annuel simulé</h2>
        <span className="text-[11px] text-subtle tabular-nums">
          couverture {Math.round(comparison.coverage * 100)} %
        </span>
      </div>
      {comparison.real && (
        <div className="flex items-center justify-between gap-2 rounded-[10px] bg-bg px-3 py-2.5">
          <span className="flex flex-col">
            <span className="text-[13px] font-medium">Réellement payé</span>
            <span className="text-[11px] text-subtle">
              contrats et prix en vigueur chaque jour
              {comparison.real.unknownContractDays > 0 &&
                ` · ${comparison.real.unknownContractDays} j sans contrat, estimés au tarif actuel`}
            </span>
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap tabular-nums">
            {eur(comparison.real.annualCents)}/an
          </span>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {comparison.rows.map((r) => {
          const delta = r.deltaAnnualCents;
          return (
            <li key={r.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{r.name}</span>
                  <Badge>{KIND_LABELS[r.contract.kind]}</Badge>
                  {r.isCurrent && <Badge tone="active">En cours</Badge>}
                </span>
                <span className="flex flex-none flex-col items-end">
                  <span className="text-[15px] font-semibold whitespace-nowrap tabular-nums">
                    {eur(r.annualCents)}/an
                  </span>
                  <span
                    className={`text-[11px] font-medium tabular-nums ${
                      delta === null || delta === 0
                        ? "text-subtle"
                        : delta < 0
                          ? "text-positive"
                          : "text-negative"
                    }`}
                  >
                    {r.isCurrent
                      ? "référence"
                      : delta === null
                        ? ""
                        : `${delta < 0 ? "−" : "+"}${eur(Math.abs(delta))}`}
                  </span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-track">
                <div
                  className={`h-1.5 rounded-full ${r.id === best?.id ? "bg-battery" : r.isCurrent ? "bg-grid" : "bg-[#CFC9BB]"}`}
                  style={{ width: `${(r.annualCents / max) * 100}%` }}
                />
              </div>
              {(r.approximate || r.assumedTempoDays > 0) && (
                <span className="text-[11px] text-pellet">
                  {r.approximate &&
                    "Simulation approximative : passez en envoi horaire pour plus de précision. "}
                  {r.assumedTempoDays > 0 &&
                    `${r.assumedTempoDays} jour${r.assumedTempoDays > 1 ? "s" : ""} de couleur inconnue, supposé${r.assumedTempoDays > 1 ? "s" : ""} bleu${r.assumedTempoDays > 1 ? "s" : ""}.`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
