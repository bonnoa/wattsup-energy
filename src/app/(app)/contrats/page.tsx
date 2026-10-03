import { PageHeader } from "@/components/page-header";
import { tempoSeasonOf } from "@/domain/tempo-calendar";
import { addDays, eachDay, localParts } from "@/lib/time";
import { listContracts } from "@/server/contracts";
import { pageContext } from "@/server/page";
import { getContractComparison } from "@/server/queries/contracts";
import { tempoCalendarView } from "@/server/tempo/sync";
import { ComparisonBanner, ComparisonEmpty, ComparisonList } from "./comparison";
import { ContractsManager } from "./contracts-manager";
import { TempoCalendar, type CalendarDay } from "./tempo-calendar";

export const metadata = { title: "Contrats · WattsUp Energy" };

export default async function ContractsPage() {
  const ctx = await pageContext("/contrats");
  const [contracts, comparison] = await Promise.all([
    listContracts(ctx),
    getContractComparison(ctx),
  ]);

  // Calendrier Tempo de la saison en cours, jusqu'au lendemain (couleur publiée vers 11 h).
  const hasTempo = contracts.some((c) => c.config.kind === "tempo");
  const today = localParts(new Date(), ctx.timezone).date;
  const season = tempoSeasonOf(today);
  let calendar: CalendarDay[] = [];
  if (hasTempo) {
    const from = `${season.slice(0, 4)}-09-01`;
    const to = addDays(today, 1);
    const view = await tempoCalendarView(ctx.householdId, from, to);
    calendar = eachDay(from, addDays(to, 1)).map((date) => ({
      date,
      color: view.get(date)?.color ?? null,
      source: view.get(date)?.source ?? null,
    }));
  }

  return (
    <>
      <PageHeader
        title="Contrats"
        subtitle="Coût simulé de chaque offre sur votre consommation réelle"
      />
      {comparison.status === "ok" && contracts.length > 0 && (
        <ComparisonBanner comparison={comparison} />
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start gap-4">
        <div className="flex flex-col gap-4">
          {comparison.status !== "ok" ? (
            <ComparisonEmpty comparison={comparison} />
          ) : (
            contracts.length > 0 && <ComparisonList comparison={comparison} />
          )}
          {hasTempo && <TempoCalendar season={season} days={calendar} />}
        </div>
        <ContractsManager
          contracts={contracts.map((c) => ({
            id: c.id,
            name: c.name,
            isCurrent: c.isCurrent,
            contract: c.config,
          }))}
        />
      </div>
    </>
  );
}
