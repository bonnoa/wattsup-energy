import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { pageContext } from "@/server/page";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Réglages · WattsUp Energy" };

export default async function SettingsPage() {
  const ctx = await pageContext("/reglages");
  return (
    <>
      <PageHeader title="Réglages" subtitle="Profil énergétique, ingestion et catégories" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start gap-4">
        <ProfileForm initial={ctx.profile} />
        <div className="flex flex-col gap-4">
          <PlaceholderCard task="T5 · T9">
            API d&apos;ingestion : endpoint, token, granularité.
          </PlaceholderCard>
          <PlaceholderCard task="T19">Postes de consommation.</PlaceholderCard>
          <PlaceholderCard task="T22">Import historique CSV.</PlaceholderCard>
        </div>
      </div>
    </>
  );
}
