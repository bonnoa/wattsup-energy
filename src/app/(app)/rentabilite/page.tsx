import { PageHeader } from "@/components/page-header";
import { visibleModules } from "@/domain/profile";
import { listEquipment, type EquipmentKind } from "@/server/equipment";
import { pageContext } from "@/server/page";
import { EquipmentCard } from "./equipment-sheet";

export const metadata = { title: "Rentabilité · WattsUp Energy" };

export default async function RoiPage() {
  const ctx = await pageContext("/rentabilite");
  const modules = visibleModules(ctx.profile);
  const kinds: EquipmentKind[] = [
    ...(modules.solar ? (["solar"] as const) : []),
    ...(modules.battery ? (["battery"] as const) : []),
  ];
  const equipment = await listEquipment(ctx);
  return (
    <>
      <PageHeader
        title="Rentabilité matérielle"
        subtitle="Amortissement de vos équipements face aux tarifs du réseau"
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-4">
        {kinds.map((kind) => (
          <EquipmentCard
            key={kind}
            kind={kind}
            item={equipment.find((e) => e.kind === kind) ?? null}
          />
        ))}
      </div>
    </>
  );
}
