import { PageHeader } from "@/components/page-header";
import { currentStock, weightedAvgPrice, type Fuel } from "@/domain/heating/fuel";
import { visibleModules } from "@/domain/profile";
import { listFuelEvents } from "@/server/fuel";
import { pageContext } from "@/server/page";
import { getHeating, getRefillForecast } from "@/server/queries/heating";
import { ForecastCard } from "./forecast-card";
import { FuelLog } from "./fuel-log";
import { HeatingCostCard, HeatingKpis, SeasonSwitcher } from "./heating-cards";
import { FuelCard } from "./quick-actions";

export const metadata = { title: "Chauffage · WattsUp Energy" };

export default async function HeatingPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string | string[] }>;
}) {
  const ctx = await pageContext("/chauffage");
  const { s } = await searchParams;
  const [view, forecast] = await Promise.all([
    getHeating(ctx, typeof s === "string" ? s : undefined),
    visibleModules(ctx.profile).refillForecast ? getRefillForecast(ctx) : null,
  ]);
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
      <SeasonSwitcher view={view} />
      <HeatingKpis view={view} />
      <HeatingCostCard view={view} />
      {fuels.length > 0 && (
        <FuelLog items={log} timezone={ctx.timezone} showFuel={fuels.length > 1} />
      )}
      {forecast && <ForecastCard view={forecast} />}
    </>
  );
}
