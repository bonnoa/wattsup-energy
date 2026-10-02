import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { headers } from "next/headers";
import { getActiveIngestToken } from "@/server/ingest/token";
import { pageContext } from "@/server/page";
import { IngestCard } from "./ingest-card";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Réglages · WattsUp Energy" };

export default async function SettingsPage() {
  const ctx = await pageContext("/reglages");
  const active = await getActiveIngestToken(ctx);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  return (
    <>
      <PageHeader title="Réglages" subtitle="Profil énergétique, ingestion et catégories" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start gap-4">
        <ProfileForm initial={ctx.profile} />
        <div className="flex flex-col gap-4">
          <IngestCard
            endpoint={`${origin}/api/v1/ingest`}
            active={
              active && {
                prefix: active.prefix,
                createdAt: active.createdAt.toISOString(),
                lastUsedAt: active.lastUsedAt?.toISOString() ?? null,
              }
            }
          />
          <PlaceholderCard task="T19">Postes de consommation.</PlaceholderCard>
          <PlaceholderCard task="T22">Import historique CSV.</PlaceholderCard>
        </div>
      </div>
    </>
  );
}
