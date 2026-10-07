import { AppNav } from "@/components/nav/app-nav";
import { visibleModules } from "@/domain/profile";
import { APP_VERSION } from "@/lib/version";
import { getLastPushAt } from "@/server/ingest/status";
import { pageContext } from "@/server/page";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await pageContext();
  const { nav } = visibleModules(ctx.profile);
  const lastPushAt = await getLastPushAt(ctx);
  const ingest = {
    lastPushAt: lastPushAt?.toISOString() ?? null,
    granularity: ctx.granularity,
    renderedAt: new Date().toISOString(),
  };

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AppNav
        items={nav}
        userName={ctx.userName || "Moi"}
        householdName={ctx.householdName}
        ingest={ingest}
        version={APP_VERSION}
        admin={ctx.isAdmin}
      />
      <main className="min-w-0 flex-1 px-4 pt-2 pb-28 lg:px-9 lg:py-8">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-5">{children}</div>
      </main>
    </div>
  );
}
