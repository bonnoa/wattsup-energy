import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { pageContext } from "@/server/page";

export const metadata = { title: "Rentabilité · WattsUp Energy" };

export default async function RoiPage() {
  await pageContext("/rentabilite");
  return (
    <>
      <PageHeader
        title="Rentabilité matérielle"
        subtitle="Amortissement de vos équipements face aux tarifs du réseau"
      />
      <PlaceholderCard task="T28 · T30">
        Amortissement du solaire et de la batterie.
      </PlaceholderCard>
    </>
  );
}
