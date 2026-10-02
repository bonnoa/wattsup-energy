import { AppNav } from "@/components/nav/app-nav";
import { visibleModules } from "@/domain/profile";
import { pageContext } from "@/server/page";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await pageContext();
  const { nav } = visibleModules(ctx.profile);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AppNav items={nav} userName={ctx.userName || "Moi"} householdName={ctx.householdName} />
      <main className="min-w-0 flex-1 px-4 pt-2 pb-28 lg:px-9 lg:py-8">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-5">{children}</div>
      </main>
    </div>
  );
}
