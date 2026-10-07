import { Suspense } from "react";
import { settingsTabsFor } from "@/lib/settings-tabs";
import { pageContext } from "@/server/page";
import { SettingsFrame } from "./settings-nav";

/** Réglages : le cadre (titre, menu des sections) ne bouge pas d'une section à l'autre. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await pageContext("/reglages");
  return (
    <Suspense>
      <SettingsFrame tabs={settingsTabsFor(ctx.profile)}>{children}</SettingsFrame>
    </Suspense>
  );
}
