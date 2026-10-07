import { PageHeader } from "@/components/page-header";
import { parseTheme } from "@/domain/theme";
import { pageContext } from "@/server/page";
import { getSession } from "@/server/session";
import { AccountCard, DeleteAccountCard } from "./account-card";
import { OnboardingCard } from "./onboarding-card";
import { ThemeCard } from "./theme-card";

export const metadata = { title: "Mon compte · WattsUp Energy" };

/** Mon compte (menu du profil) : identifiants, apparence, parcours de bienvenue, suppression. */
export default async function AccountPage() {
  const ctx = await pageContext("/compte");
  const theme = parseTheme((await getSession())?.user.theme);
  return (
    <>
      <PageHeader
        title="Mon compte"
        subtitle={`${ctx.userName || "Mon compte"} · ${ctx.householdName}`}
      />
      <div className="flex max-w-2xl flex-col gap-4">
        <AccountCard name={ctx.userName} email={ctx.userEmail} />
        <ThemeCard theme={theme} />
        <OnboardingCard />
        <DeleteAccountCard />
      </div>
    </>
  );
}
