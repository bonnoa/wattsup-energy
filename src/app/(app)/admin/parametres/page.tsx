import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getContactTexts } from "@/server/instance";
import { mailConfigured } from "@/server/mail";
import { pageContext } from "@/server/page";
import { ContactTextsCard } from "./contact-texts-card";

export const metadata = { title: "Paramètres · WattsUp Energy" };

/** Administration › Paramètres (T53) : réglages de l'instance qui ne concernent pas les comptes. */
export default async function InstanceSettingsPage() {
  const ctx = await pageContext("/admin/parametres");
  if (!ctx.isAdmin) redirect("/");
  const texts = await getContactTexts();
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Administration · réglages de l'instance" />
      <div className="max-w-2xl">
        <ContactTextsCard
          label={texts.label}
          intro={texts.intro}
          notice={texts.notice ?? ""}
          mailOn={mailConfigured()}
        />
      </div>
    </>
  );
}
