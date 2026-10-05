import { PageHeader } from "@/components/page-header";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { Card } from "@/components/ui";
import { pageContext } from "@/server/page";
import { AccountCard, DeleteAccountCard } from "./account-card";
import { OnboardingCard } from "./onboarding-card";

export const metadata = { title: "Compte · WattsUp Energy" };

/** Compte (ouvert depuis le nom en bas de la barre latérale, ou l'initiale sur mobile). */
export default async function AccountPage() {
  const ctx = await pageContext("/compte");
  return (
    <>
      <PageHeader
        title="Compte"
        subtitle={`${ctx.userName || "Mon compte"} · ${ctx.householdName}`}
      />
      <div className="flex max-w-2xl flex-col gap-4">
        <AccountCard email={ctx.userEmail} />
        <OnboardingCard />
        <Card title="Session" description="Vous serez redirigé vers la page de connexion.">
          <SignOutButton variant="page" />
        </Card>
        <DeleteAccountCard />
      </div>
    </>
  );
}
