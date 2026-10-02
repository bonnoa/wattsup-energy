import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { pageContext } from "@/server/page";

export const metadata = { title: "Contrats · WattsUp Energy" };

export default async function ContractsPage() {
  await pageContext("/contrats");
  return (
    <>
      <PageHeader
        title="Contrats"
        subtitle="Coût simulé de chaque offre sur votre consommation réelle"
      />
      <PlaceholderCard task="T17 · T18">
        Comparaison des contrats et calendrier Tempo.
      </PlaceholderCard>
    </>
  );
}
