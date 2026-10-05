import { PageHeader } from "@/components/page-header";
import { localParts } from "@/lib/time";
import {
  currentStock,
  referencePrice,
  type Fuel,
  type ReferencePrice,
} from "@/domain/heating/fuel";
import { visibleModules } from "@/domain/profile";
import { listFuelEvents } from "@/server/fuel";
import { pageContext } from "@/server/page";
import { getHeating, getRefillForecast } from "@/server/queries/heating";
import { ForecastCard } from "./forecast-card";
import { FuelLog } from "./fuel-log";
import { HeatingCostCard, HeatingKpis, SeasonSwitcher } from "./heating-cards";
import { FuelCard } from "./quick-actions";

export const metadata = { title: "Chauffage · WattsUp Energy" };

const purchaseMonth = (d: Date, timeZone: string) =>
  d.toLocaleDateString("fr-FR", { month: "short", year: "numeric", timeZone });

/** Origine du prix de référence, sous la tuile « Prix moyen payé ». */
function priceNote(price: ReferencePrice | null, timeZone: string): string | null {
  if (!price) return null;
  if (price.basis === "recent") return "achats des 12 derniers mois";
  const month = purchaseMonth(price.purchasedAt, timeZone);
  return price.basis === "last" ? `dernier achat, ${month}` : `premier achat, ${month}`;
}

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
  // Dernières saisies d'abord : une consommation passée y apparaît tout de suite.
  const log = events
    .filter((e) => fuels.includes(e.fuel))
    .sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.at.getTime() - a.at.getTime(),
    )
    .slice(0, 20)
    .map((e) => ({
      id: e.id,
      fuel: e.fuel,
      type: e.type,
      at: e.at.toISOString(),
      qty: e.qty,
      unit: e.unit,
      priceEur: e.priceEur,
    }));

  return (
    <>
      <PageHeader
        title="Chauffage"
        subtitle="Électricité dédiée et combustibles, mis en regard de la météo locale"
      />
      {fuels.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-4">
          {fuels.map((fuel) => {
            const price = referencePrice(events, fuel, ctx.settings, now);
            return (
              <FuelCard
                key={fuel}
                summary={{
                  fuel,
                  stock: currentStock(events, fuel, now, ctx.settings),
                  avgPrice: price?.perUnit ?? null,
                  priceNote: priceNote(price, ctx.timezone),
                  bagKg: ctx.settings.pelletBagKg,
                }}
              />
            );
          })}
        </div>
      )}
      <SeasonSwitcher view={view} />
      <HeatingKpis view={view} />
      <HeatingCostCard view={view} />
      {fuels.length > 0 && (
        <FuelLog
          items={log}
          timezone={ctx.timezone}
          fuels={fuels}
          currentMonth={localParts(now, ctx.timezone).date.slice(0, 7)}
          settings={{
            pelletBagKg: ctx.settings.pelletBagKg,
            pelletBagsPerPallet: ctx.settings.pelletBagsPerPallet,
          }}
        />
      )}
      {forecast && <ForecastCard view={forecast} />}
    </>
  );
}
