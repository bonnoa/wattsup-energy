"use client";

import { useEffect, useState } from "react";
import { Badge, button, Card, Icon } from "@/components/ui";
import { lastPushAction } from "@/server/actions/onboarding";

const POLL_MS = 5000;

/** Blueprint (import direct dans HA ou téléchargement) et attente du premier envoi. */
export function HomeAssistantStep({
  blueprintUrl,
  initialLastPush,
}: {
  blueprintUrl: string;
  initialLastPush: string | null;
}) {
  const [lastPush, setLastPush] = useState(initialLastPush);
  useEffect(() => {
    if (lastPush) return;
    const id = setInterval(async () => {
      const at = await lastPushAction();
      if (at) setLastPush(at);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [lastPush]);

  const importUrl = `https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=${encodeURIComponent(blueprintUrl)}`;
  return (
    <Card
      icon="download"
      title="Blueprint WattsUp"
      highlight={lastPush !== null}
      badges={
        lastPush ? (
          <Badge tone="positive">Premier envoi reçu</Badge>
        ) : (
          <Badge tone="warning">En attente du premier envoi</Badge>
        )
      }
      description="Une automatisation prête à l'emploi : choisissez vos capteurs d'énergie, collez l'adresse et le token ci-dessus."
    >
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] text-pretty">
        <li>Générez un token et copiez l&apos;endpoint (carte ci-dessus).</li>
        <li>
          Dans Home Assistant, ajoutez la commande REST et le token dans{" "}
          <span className="font-mono text-xs">secrets.yaml</span> (voir le guide du dépôt,{" "}
          <span className="font-mono text-xs">homeassistant/README.md</span>).
        </li>
        <li>Importez le blueprint, créez l&apos;automatisation et choisissez vos capteurs.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <a href={importUrl} target="_blank" rel="noreferrer" className={button.primary}>
          Importer dans Home Assistant
        </a>
        <a href={blueprintUrl} download="wattsup_push.yaml" className={button.secondary}>
          <Icon name="download" size={14} />
          Télécharger le blueprint
        </a>
      </div>
      <p role="status" className="flex items-center gap-2 text-[13px]">
        {lastPush ? (
          <>
            <span className="size-2 rounded-full bg-battery" />
            Données reçues : votre tableau de bord se remplit.
          </>
        ) : (
          <>
            <span className="size-2 animate-pulse rounded-full bg-pellet" />
            En attente du premier envoi de Home Assistant (vérification toutes les 5 secondes)…
          </>
        )}
      </p>
    </Card>
  );
}
