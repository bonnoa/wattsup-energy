import Link from "next/link";
import { button, Notice } from "@/components/ui";
import { settingsHref } from "@/lib/settings-tabs";

/**
 * Aucune donnée reçue : dire pourquoi l'écran est vide et proposer les deux façons de le
 * remplir (connecter Home Assistant, importer un historique CSV).
 */
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Notice
      tone="info"
      title={title}
      action={
        <>
          <Link href={settingsHref("home-assistant")} className={button.primary}>
            Connecter Home Assistant
          </Link>
          <Link href={settingsHref("historique")} className={button.secondary}>
            Importer un historique CSV
          </Link>
        </>
      }
    >
      {children}
    </Notice>
  );
}
