import { button, Card } from "@/components/ui";

// Décompte d'un combustible depuis Home Assistant (SPEC §6.5) : un script HA à brancher
// sur un bouton (tableau de bord, bouton physique) ou une automatisation.

export function HaFuelCard({ origin }: { origin: string }) {
  const url = `${origin}/api/blueprint/wattsup_fuel.yaml`;
  const importUrl = `https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=${encodeURIComponent(url)}`;
  return (
    <Card
      icon="plus"
      title="Sac versé depuis Home Assistant"
      description="Décomptez un sac (ou un demi-stère) sans ouvrir l'appli : bouton du tableau de bord, bouton physique près du poêle, ou automatisation."
    >
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] text-pretty">
        <li>Importez le blueprint « sac versé » et créez un script à partir de lui.</li>
        <li>
          Appelez ce script depuis une carte bouton, un bouton physique ou une automatisation. Une
          notification donne le stock restant.
        </li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <a href={importUrl} target="_blank" rel="noreferrer" className={button.secondary}>
          Importer « sac versé »
        </a>
      </div>
    </Card>
  );
}
