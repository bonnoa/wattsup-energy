import { button, Card } from "@/components/ui";

// Historique depuis Home Assistant (SPEC §6.4) : HA envoie à la demande ses statistiques
// horaires sur une période. Rien à configurer côté WattsUp : la carte guide l'utilisateur.

const importUrl = (url: string) =>
  `https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=${encodeURIComponent(url)}`;

export function HaHistoryCard({ origin }: { origin: string }) {
  const push = `${origin}/api/blueprint/wattsup_push.yaml`;
  const history = `${origin}/api/blueprint/wattsup_history.yaml`;
  return (
    <Card
      icon="download"
      title="Depuis Home Assistant"
      description="Récupérez l'historique d'une période directement depuis les statistiques de Home Assistant, sans fichier."
    >
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] text-pretty">
        <li>
          Mettez à jour le blueprint d&apos;envoi (réimportez-le en acceptant de remplacer la
          version installée) : votre automatisation garde ses réglages.
        </li>
        <li>
          Importez le blueprint « envoyer l&apos;historique » et créez un script à partir de lui.
        </li>
        <li>
          Lancez le script en choisissant les dates : l&apos;envoi se fait jour par jour, en
          arrière-plan. Le résultat s&apos;affiche dans Réglages › Home Assistant › Derniers envois.
        </li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <a href={importUrl(push)} target="_blank" rel="noreferrer" className={button.secondary}>
          Mettre à jour le blueprint d&apos;envoi
        </a>
        <a href={importUrl(history)} target="_blank" rel="noreferrer" className={button.primary}>
          Importer « envoyer l&apos;historique »
        </a>
      </div>
      <p className="text-xs text-muted text-pretty">
        Les valeurs déjà présentes ne sont jamais remplacées ; les valeurs invraisemblables (sauts
        de compteur) sont rejetées et comptées. Dix ans au plus, jusqu&apos;à hier. En envoi
        quotidien, chaque jour arrive en total, sans séparer heures pleines et heures creuses.
        Nécessite une version récente de Home Assistant (action « recorder.get_statistics »).
      </p>
    </Card>
  );
}
