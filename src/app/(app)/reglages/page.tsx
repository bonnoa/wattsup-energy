import { PageHeader } from "@/components/page-header";
import { headers } from "next/headers";
import { pushState } from "@/domain/ingest/push-state";
import { listCategories, unknownCategorySlugs } from "@/server/categories";
import { getLastPushAt } from "@/server/ingest/status";
import { getActiveIngestToken } from "@/server/ingest/token";
import { getLocationStatus } from "@/server/location";
import { pageContext } from "@/server/page";
import { CategoriesCard } from "./categories-card";
import { CsvCard } from "./csv-card";
import { IngestCard } from "./ingest-card";
import { LocationCard } from "./location-card";
import { OnboardingCard } from "./onboarding-card";
import { ProfileForm } from "./profile-form";
import { SolarBatteryCard } from "./solar-battery-card";

export const metadata = { title: "Réglages · WattsUp Energy" };

export default async function SettingsPage() {
  const ctx = await pageContext("/reglages");
  const [active, location, lastPushAt, categories, unknown] = await Promise.all([
    getActiveIngestToken(ctx),
    getLocationStatus(ctx),
    getLastPushAt(ctx),
    listCategories(ctx),
    unknownCategorySlugs(ctx),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  return (
    <>
      <PageHeader
        title="Réglages"
        subtitle="Profil énergétique, localisation, ingestion et catégories"
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start gap-4">
        <div className="flex flex-col gap-4">
          <ProfileForm initial={ctx.profile} />
          <LocationCard status={location} />
          {(ctx.profile.solar || ctx.profile.battery) && (
            <SolarBatteryCard
              solar={ctx.profile.solar}
              battery={ctx.profile.battery}
              initial={{
                exportEnabled: ctx.settings.exportEnabled,
                exportPriceEurKwh: ctx.settings.exportPriceEurKwh,
                batteryGridCharging: ctx.settings.batteryGridCharging,
              }}
            />
          )}
        </div>
        <div className="flex flex-col gap-4">
          <IngestCard
            endpoint={`${origin}/api/v1/ingest`}
            granularity={ctx.granularity}
            lastPushAt={lastPushAt?.toISOString() ?? null}
            link={pushState(lastPushAt?.getTime() ?? null, Date.now(), ctx.granularity)}
            active={
              active && {
                prefix: active.prefix,
                createdAt: active.createdAt.toISOString(),
              }
            }
          />
          <CategoriesCard
            timezone={ctx.timezone}
            unknown={unknown}
            categories={categories.map((c) => ({
              ...c,
              lastDataAt: c.lastDataAt?.toISOString() ?? null,
            }))}
          />
          <div id="import-csv" className="scroll-mt-6">
            <CsvCard
              granularity={ctx.granularity}
              timezone={ctx.timezone}
              slugs={categories.map((c) => c.slug)}
            />
          </div>
          <OnboardingCard />
        </div>
      </div>
    </>
  );
}
