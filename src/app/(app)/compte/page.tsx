import { PageHeader } from "@/components/page-header";
import { parseTheme } from "@/domain/theme";
import { mailConfigured } from "@/server/mail";
import { pageContext } from "@/server/page";
import { listPushDevices, pushConfig } from "@/server/push";
import { getSession } from "@/server/session";
import { AccountCard, DeleteAccountCard, type EmailConfirmation } from "./account-card";
import { ExportCard } from "./export-card";
import { OnboardingCard } from "./onboarding-card";
import { PushCard } from "./push-card";
import { ThemeCard } from "./theme-card";

export const metadata = { title: "Mon compte · WattsUp Energy" };

/** Mon compte (menu du profil) : identifiants, apparence, parcours de bienvenue, suppression. */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[]; error?: string | string[] }>;
}) {
  const ctx = await pageContext("/compte");
  // Retour du lien de confirmation d'une nouvelle adresse (Better Auth ajoute `error` si le
  // lien est expiré ou invalide).
  const params = await searchParams;
  const confirmation: EmailConfirmation =
    params.email !== "confirme" ? null : params.error ? "invalid" : "ok";
  const theme = parseTheme((await getSession())?.user.theme);
  const push = pushConfig();
  const devices = push ? await listPushDevices(ctx) : [];
  return (
    <>
      <PageHeader
        title="Mon compte"
        subtitle={`${ctx.userName || "Mon compte"} · ${ctx.householdName}`}
      />
      <div className="flex max-w-2xl flex-col gap-4">
        <AccountCard
          name={ctx.userName}
          email={ctx.userEmail}
          confirmByEmail={mailConfigured()}
          confirmation={confirmation}
        />
        <ThemeCard theme={theme} />
        {push && (
          <PushCard
            publicKey={push.publicKey}
            devices={devices.map((d) => ({
              endpoint: d.endpoint,
              label: d.label,
              createdOn: d.createdAt.toLocaleDateString("fr-FR", { timeZone: ctx.timezone }),
            }))}
          />
        )}
        <OnboardingCard />
        <ExportCard />
        <DeleteAccountCard />
      </div>
    </>
  );
}
