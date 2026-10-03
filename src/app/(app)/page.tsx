import Link from "next/link";
import {
  BudgetCard,
  CategoriesOverviewCard,
  KpiTiles,
  MonthlyCostCard,
  OriginCard,
  PeriodSwitcher,
  SolarCard,
} from "@/components/cards/overview-cards";
import { PageHeader } from "@/components/page-header";
import { button, Notice } from "@/components/ui";
import { visibleModules } from "@/domain/profile";
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
        <Notice
          tone="info"
          title="Aucune donnée pour l'instant."
          action={
            <Link href="/reglages" className={button.primary}>
              Connecter Home Assistant
            </Link>
          }
        >
          Le tableau de bord se remplit dès le premier envoi de Home Assistant (Réglages › API
          d&apos;ingestion).
        </Notice>
      ) : (
        <>
          <PeriodSwitcher overview={overview} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4">
            <BudgetCard overview={overview} />
            <KpiTiles overview={overview} solar={modules.solar} battery={modules.battery} />
          </div>
          <MonthlyCostCard overview={overview} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-4">
            <OriginCard overview={overview} solar={modules.solar} battery={modules.battery} />
            <CategoriesOverviewCard overview={overview} />
          </div>
          <SolarCard overview={overview} />
        </>
      )}
    </>
  );
}
