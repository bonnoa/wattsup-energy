import { PageHeader } from "@/components/page-header";
import { pageContext } from "@/server/page";
import { AccountCard, DeleteAccountCard } from "./account-card";
import { OnboardingCard } from "./onboarding-card";

export const metadata = { title: "Mon compte · WattsUp Energy" };

/** Mon compte (menu du profil) : identifiants, parcours de bienvenue, suppression. */
export default async function AccountPage() {
  const ctx = await pageContext("/compte");
  return (
    <>
      <PageHeader
        title="Mon compte"
        subtitle={`${ctx.userName || "Mon compte"} · ${ctx.householdName}`}
      />
      <div className="flex max-w-2xl flex-col gap-4">
        <AccountCard name={ctx.userName} email={ctx.userEmail} />
        <OnboardingCard />
        <DeleteAccountCard />
      </div>
    </>
  );
}
