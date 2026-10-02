import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { pageContext } from "@/server/page";

export const metadata = { title: "Chauffage · WattsUp Energy" };

export default async function HeatingPage() {
  await pageContext("/chauffage");
  return (
    <>
      <PageHeader
        title="Chauffage"
        subtitle="Électricité dédiée et combustibles, mis en regard de la météo locale"
      />
      <PlaceholderCard task="T24 · T26 · T27">
        Suivi des combustibles, coût de chauffe et prévision de réapprovisionnement.
      </PlaceholderCard>
    </>
  );
}
