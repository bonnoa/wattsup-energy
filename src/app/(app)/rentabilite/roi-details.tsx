import Link from "next/link";
import { RingGauge } from "@/components/charts/ring-gauge";
import { BatteryGapNotices } from "@/components/battery-gap-notice";
import { Badge, button, Notice, StatTile, tiles } from "@/components/ui";
import { monthLabel } from "@/domain/overview";
import { formatEurFromCents, formatNumber, formatPercent } from "@/lib/format";
import type { EquipmentRoi, RoiView } from "@/server/queries/roi";

// Amortissement d'un équipement (T30), affiché dans sa carte.

const eur = (cents: number) => formatEurFromCents(cents, 0);
const fmtMonth = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const STATUS = {
  amortized: { label: "Amorti", tone: "positive" },
  "in-progress": { label: "En cours d'amortissement", tone: "soft" },
  "no-savings": { label: "Aucune économie mesurée", tone: "warning" },
} as const;

/** Frise : installation → aujourd'hui → amortissement prévu. */
function Timeline({ roi, today }: { roi: EquipmentRoi; today: string }) {
  const start = Date.parse(roi.equipment.installedOn);
  const end = roi.payback.paybackDate ? Date.parse(roi.payback.paybackDate) : null;
  const now = Date.parse(today);
  const progress =
    roi.payback.status === "amortized" ? 1 : end && end > start ? (now - start) / (end - start) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-2 rounded-full bg-track" aria-hidden>
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-battery"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>
      <div className="flex justify-between gap-2 text-[11px] text-subtle tabular-nums">
        <span>Installé le {fmtDay(roi.equipment.installedOn)}</span>
        <span className="text-right">
          {roi.payback.status === "amortized"
            ? "Amorti"
            : roi.payback.paybackDate
              ? `Amorti vers ${fmtMonth(roi.payback.paybackDate)}`
              : "Date d'amortissement inconnue"}
        </span>
      </div>
    </div>
  );
}

export function RoiDetails({ roi, view }: { roi: EquipmentRoi; view: RoiView }) {
  const { savings, payback } = roi;
  const status = STATUS[payback.status];
  const solar = roi.equipment.kind === "solar";
  const lines = solar
    ? [
        { label: "Électricité évitée (autoconsommation)", cents: savings.parts.avoided },
        ...(view.settings.exportEnabled
          ? [{ label: "dont revente du surplus", cents: savings.parts.export }]
          : []),
      ]
    : [
        { label: "Électricité évitée (décharge)", cents: savings.parts.avoided },
        ...(view.settings.batteryGridCharging
          ? [{ label: "Charge depuis le réseau", cents: savings.parts.gridCharge }]
          : []),
        ...(view.settings.exportEnabled
          ? [{ label: "Revente perdue (énergie stockée)", cents: savings.parts.lostExport }]
          : []),
      ];

  return (
    <div className="flex flex-col gap-4">
      <BatteryGapNotices gaps={roi.gaps} context="roi" />
      <div className="flex items-center gap-4">
        <RingGauge ratio={payback.ratio} label={formatPercent(payback.ratio)} />
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          {/* Ce qu'on lit d'abord : ce que l'équipement a déjà rapporté, face à son coût. */}
          <p className="text-[26px] leading-none font-semibold tracking-tight tabular-nums">
            {eur(payback.cumulativeCents)}
          </p>
          <p className="text-[13px] text-muted text-pretty">
            économisés sur {formatNumber(roi.equipment.costEur)} €
            {roi.dataFrom && roi.dataFrom > roi.equipment.installedOn && (
              <> (depuis la première donnée, le {fmtDay(roi.dataFrom)})</>
            )}
          </p>
        </div>
      </div>

      <div className={tiles}>
        <StatTile
          label="Économie mensuelle"
          value={formatNumber(payback.monthlyCents / 100)}
          unit="€/mois"
          sub={
            payback.averagedMonths >= 12
              ? "moyenne des 12 derniers mois"
              : payback.averagedMonths > 1
                ? `moyenne des ${payback.averagedMonths} mois complets`
                : payback.averagedMonths === 1
                  ? "sur le seul mois complet"
                  : "aucun mois complet"
          }
        />
        <StatTile
          label="Amortissement prévu"
          value={
            payback.status === "amortized"
              ? "Atteint"
              : payback.paybackDate
                ? fmtMonth(payback.paybackDate)
                : "—"
          }
        />
      </div>

      <Timeline roi={roi} today={view.today} />

      <ul className="flex flex-col gap-1.5 text-[13px]">
        {lines.map((l) => (
          <li key={l.label} className="flex justify-between gap-2">
            <span className="text-[#5E625C]">{l.label}</span>
            <span className="whitespace-nowrap tabular-nums">{eur(l.cents)}</span>
          </li>
        ))}
      </ul>
      {!solar && view.settings.batteryGridCharging && (
        <p className="text-[11px] text-subtle">Charge depuis le réseau incluse dans le calcul.</p>
      )}

      {solar &&
        view.solarYield &&
        (view.solarYield.alert ? (
          <Notice title={`Production en baisse en ${monthLabel(view.solarYield.month)} :`}>
            {formatPercent(Math.abs(view.solarYield.deviation))} sous le rendement attendu pour
            l&apos;ensoleillement reçu ({formatNumber(view.solarYield.yield, 2)} kWh par kWh/m²,
            contre {formatNumber(view.solarYield.reference, 2)} d&apos;habitude). Vérifiez la
            propreté des panneaux et l&apos;état de l&apos;onduleur.
          </Notice>
        ) : (
          <p className="rounded-control bg-bg px-3 py-2.5 text-xs text-muted text-pretty tabular-nums">
            Rendement de {monthLabel(view.solarYield.month)} :{" "}
            <span className="font-semibold text-ink">
              {formatNumber(view.solarYield.yield, 2)} kWh par kWh/m²
            </span>{" "}
            reçu ({view.solarYield.deviation >= 0 ? "+" : "−"}
            {formatPercent(Math.abs(view.solarYield.deviation))} par rapport à d&apos;habitude).
          </p>
        ))}

      {view.noContract && (
        <Notice
          title="Économies non chiffrées :"
          action={
            <Link href="/contrats" className={button.primary}>
              Ajouter mon contrat
            </Link>
          }
        >
          sans contrat d&apos;électricité en cours, le prix du kWh évité est inconnu.
        </Notice>
      )}
    </div>
  );
}
