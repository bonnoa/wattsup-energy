import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { listContracts } from "@/server/contracts";
import { pageContext } from "@/server/page";
import { ContractsManager } from "./contracts-manager";

export const metadata = { title: "Contrats · WattsUp Energy" };

export default async function ContractsPage() {
  const ctx = await pageContext("/contrats");
  const contracts = await listContracts(ctx);
  return (
    <>
      <PageHeader
        title="Contrats"
        subtitle="Coût simulé de chaque offre sur votre consommation réelle"
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start gap-4">
        <ContractsManager
          contracts={contracts.map((c) => ({
            id: c.id,
            name: c.name,
            isCurrent: c.isCurrent,
            contract: c.config,
          }))}
        />
        <PlaceholderCard task="T18">
          Comparaison sur 12 mois, meilleur contrat et calendrier Tempo.
        </PlaceholderCard>
      </div>
    </>
  );
}
