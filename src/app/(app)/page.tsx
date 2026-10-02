import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { pageContext } from "@/server/page";

export default async function OverviewPage() {
  await pageContext("/");
  return (
    <>
      <PageHeader
        title="Vue d'ensemble"
        subtitle="Budget énergie, sources et postes de consommation"
      />
      <PlaceholderCard task="T20">
        Le tableau de bord apparaîtra ici dès que Home Assistant aura envoyé ses premières données.
      </PlaceholderCard>
    </>
  );
}
