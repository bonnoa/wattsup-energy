import { button, Card, Icon } from "@/components/ui";

// Mes données (T46) : téléchargement de l'énergie (CSV, réimportable dans WattsUp ou lisible
// dans un tableur) et de tout le reste (JSON). Liens directs : le navigateur télécharge.

export function ExportCard() {
  return (
    <Card
      icon="download"
      title="Mes données"
      description="Une copie complète, à garder ou à emporter ailleurs. Aucun token ni mot de passe n'y figure."
    >
      <ul className="flex flex-col gap-3">
        <li className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold">Énergie</span>
            <span className="text-xs text-muted text-pretty">
              Toutes les valeurs enregistrées, en CSV au format de l&apos;import : réimportable ou
              lisible dans un tableur.
            </span>
          </span>
          <a
            href="/api/export/energie"
            download
            className={`${button.secondary} text-ink no-underline`}
          >
            <Icon name="download" size={15} />
            CSV
          </a>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-3 border-t border-track pt-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold">Tout le reste</span>
            <span className="text-xs text-muted text-pretty">
              Compte, foyer, réglages, postes, contrats et grilles, combustibles, équipements,
              repères, idées, en JSON.
            </span>
          </span>
          <a
            href="/api/export/donnees"
            download
            className={`${button.secondary} text-ink no-underline`}
          >
            <Icon name="download" size={15} />
            JSON
          </a>
        </li>
      </ul>
    </Card>
  );
}
