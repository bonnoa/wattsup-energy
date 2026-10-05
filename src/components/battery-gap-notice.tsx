import Link from "next/link";
import { button, Notice } from "@/components/ui";
import { monthRangeLabel, type BatteryGap } from "@/domain/battery-data";
import { settingsHref } from "@/lib/settings-tabs";

// Charge ou décharge de la batterie absente sur des mois (historique importé incomplet) :
// on dit ce qui est faussé et on propose d'importer la mesure manquante.

const EFFECT = {
  overview: {
    charge: "le solaire autoconsommé et la consommation du foyer sont surestimés",
    discharge: "la part de la batterie et la consommation du foyer sont sous-estimées",
  },
  roi: {
    charge:
      "les économies de la batterie sont surestimées, et le solaire compte deux fois l'énergie stockée",
    discharge: "les économies de la batterie sont sous-estimées",
  },
} as const;

export function BatteryGapNotices({
  gaps,
  context,
}: {
  gaps: readonly BatteryGap[];
  context: keyof typeof EFFECT;
}) {
  return gaps.map((g) => (
    <Notice
      key={g.missing}
      title={
        g.missing === "charge"
          ? "Charge de la batterie manquante :"
          : "Décharge de la batterie manquante :"
      }
      action={
        <Link href={settingsHref("historique")} className={button.secondary}>
          Importer l&apos;historique
        </Link>
      }
    >
      {g.missing === "charge"
        ? "la décharge a été reçue sans la charge"
        : "la charge a été reçue sans la décharge"}{" "}
      ({monthRangeLabel(g.months)}). Sur ces mois, {EFFECT[context][g.missing]}.
    </Notice>
  ));
}
