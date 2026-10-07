import {
  BudgetCard,
  CategoriesOverviewCard,
  KpiTiles,
  OriginCard,
  PeakCard,
  PeriodSwitcher,
  SolarCard,
} from "@/components/cards/overview-cards";
import { BatteryGapNotices } from "@/components/battery-gap-notice";
import { MarkersStrip } from "@/components/cards/markers-strip";
import { MonthlyCostCard } from "@/components/cards/monthly-cost-card";
import { MonthlyTable } from "@/components/cards/monthly-table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { visibleModules } from "@/domain/profile";
import { localParts } from "@/lib/time";
import { pageContext } from "@/server/page";
import { getOverview } from "@/server/queries/overview";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  const ctx = await pageContext("/");
  const { p } = await searchParams;
  const overview = await getOverview(ctx, typeof p === "string" ? p : undefined);
  const modules = visibleModules(ctx.profile);

  return (
    <>
      <PageHeader
        title="Vue d'ensemble"
        subtitle="Budget énergie, origine de la consommation et postes"
      />
      {overview.status === "no-data" ? (
        <EmptyState title="Aucune donnée pour l'instant.">
          Le tableau de bord se remplit dès le premier envoi de Home Assistant, ou avec
          l&apos;import de votre historique.
        </EmptyState>
      ) : (
        <>
          <PeriodSwitcher overview={overview} />
          <MarkersStrip
            markers={overview.markers}
            period={overview.period}
            today={localParts(new Date(), ctx.timezone).date}
          />
          <BatteryGapNotices gaps={overview.batteryGaps} context="overview" />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4">
            <BudgetCard overview={overview} />
            <KpiTiles overview={overview} solar={modules.solar} battery={modules.battery} />
          </div>
          <MonthlyCostCard
            months={overview.months}
            period={overview.period}
            markers={overview.markers}
          />
          <PeakCard overview={overview} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-4">
            <OriginCard overview={overview} solar={modules.solar} battery={modules.battery} />
            <CategoriesOverviewCard overview={overview} />
          </div>
          <SolarCard overview={overview} />
          <MonthlyTable
            months={overview.months}
            year={overview.period.key.slice(0, 4)}
            currentMonth={localParts(new Date(), ctx.timezone).date.slice(0, 7)}
            solar={modules.solar}
          />
        </>
      )}
    </>
  );
}
