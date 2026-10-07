import { PageHeader } from "@/components/page-header";
import { SupportLink } from "@/components/support-link";
import { APP_VERSION } from "@/lib/version";
import { listIdeas } from "@/server/ideas";
import { pageContext } from "@/server/page";
import { IdeaForm } from "./idea-form";
import { IdeasBoard, type IdeaCard } from "./ideas-board";

export const metadata = { title: "Boîte à idées · WattsUp Energy" };

const longDay = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });

/** Boîte à idées (SPEC §9) : proposer, voter, suivre l'avancement. */
export default async function IdeasPage() {
  const ctx = await pageContext("/idees");
  const ideas: IdeaCard[] = (await listIdeas(ctx)).map((i) => ({
    ...i,
    createdOn: longDay(i.createdAt),
  }));
  return (
    <>
      <PageHeader
        title="Boîte à idées"
        subtitle="Proposez une amélioration et votez pour celles qui vous tiennent à cœur."
      />
      <div className="flex max-w-3xl flex-col gap-5">
        <IdeaForm />
        <IdeasBoard ideas={ideas} isAdmin={ctx.isAdmin} currentVersion={APP_VERSION} />
        <SupportLink />
      </div>
    </>
  );
}
