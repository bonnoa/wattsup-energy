import { PageHeader } from "@/components/page-header";
import { RichText } from "@/components/rich-text";
import { SupportLink } from "@/components/support-link";
import { Notice } from "@/components/ui";
import { getContactTexts } from "@/server/instance";
import { mailConfigured } from "@/server/mail";
import { pageContext } from "@/server/page";
import { ContactForm } from "./contact-form";

export const metadata = { title: "Contact · WattsUp Energy" };

/**
 * Contact (SPEC §9) : prendre contact ou signaler un bug, par email à l'administrateur.
 * Intitulé et texte sous le bouton de soutien réglés dans Administration › Paramètres (T53).
 */
export default async function ContactPage() {
  const ctx = await pageContext("/contact");
  const texts = await getContactTexts();
  return (
    <>
      <PageHeader title={texts.label} subtitle={texts.intro} />
      <div className="flex max-w-2xl flex-col gap-5">
        {mailConfigured() ? (
          <ContactForm name={ctx.userName} email={ctx.userEmail} title={texts.formTitle} />
        ) : (
          <Notice tone="info" title="Messagerie non configurée :">
            cette instance n&apos;envoie pas d&apos;emails, le formulaire de contact est donc
            indisponible.
          </Notice>
        )}
        <SupportLink />
        {texts.notice && (
          <div className="rounded-card border border-border bg-surface p-5">
            <RichText text={texts.notice} />
          </div>
        )}
      </div>
    </>
  );
}
