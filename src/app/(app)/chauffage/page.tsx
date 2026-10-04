import { PageHeader } from "@/components/page-header";
import { PlaceholderCard } from "@/components/placeholder-card";
import { currentStock, weightedAvgPrice, type Fuel } from "@/domain/heating/fuel";
import { visibleModules } from "@/domain/profile";
import { listFuelEvents } from "@/server/fuel";
import { pageContext } from "@/server/page";
import { FuelLog } from "./fuel-log";
import { FuelCard } from "./quick-actions";

export const metadata = { title: "Chauffage · WattsUp Energy" };

export default async function HeatingPage() {
  const ctx = await pageContext("/chauffage");
  const modules = visibleModules(ctx.profile);
  const fuels: Fuel[] = [
    ...(modules.pellet ? (["pellet"] as const) : []),
    ...(modules.wood ? (["wood"] as const) : []),
  ];
  const events = fuels.length > 0 ? await listFuelEvents(ctx) : [];
  const now = new Date();
  const log = events
    .filter((e) => fuels.includes(e.fuel))
    .slice(-20)
    .reverse()
    .map((e) => ({ ...e, at: e.at.toISOString() }));

  return (
    <>
      <PageHeader
        title="Chauffage"
        subtitle="Électricité dédiée et combustibles, mis en regard de la météo locale"
      />
      {fuels.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-4">
          {fuels.map((fuel) => (
            <FuelCard
              key={fuel}
              summary={{
                fuel,
                stock: currentStock(events, fuel, now, ctx.settings),
                avgPrice: weightedAvgPrice(events, fuel, ctx.settings),
                bagKg: ctx.settings.pelletBagKg,
              }}
            />
          ))}
        </div>
      )}
      {fuels.length > 0 && (
        <FuelLog items={log} timezone={ctx.timezone} showFuel={fuels.length > 1} />
      )}
      <PlaceholderCard task="T26 · T27">
        Coût de chauffe de la saison face à la température, et prévision de réapprovisionnement.
      </PlaceholderCard>
    </>
  );
}
