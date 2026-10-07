import { PageHeader } from "@/components/page-header";
import { SupportLink } from "@/components/support-link";
import { Notice } from "@/components/ui";
import { mailConfigured } from "@/server/mail";
import { pageContext } from "@/server/page";
import { ContactForm } from "./contact-form";

export const metadata = { title: "Contact · WattsUp Energy" };

/** Contact (SPEC §9) : prendre contact ou signaler un bug, par email à l'administrateur. */
export default async function ContactPage() {
  const ctx = await pageContext("/contact");
  return (
    <>
      <PageHeader
        title="Contact"
        subtitle="Une question, une remarque ou un bug : écrivez à l'administrateur de WattsUp."
      />
      <div className="flex max-w-2xl flex-col gap-5">
        {mailConfigured() ? (
          <ContactForm name={ctx.userName} email={ctx.userEmail} />
        ) : (
          <Notice tone="info" title="Messagerie non configurée :">
            cette instance n&apos;envoie pas d&apos;emails, le formulaire de contact est donc
            indisponible.
          </Notice>
        )}
        <SupportLink />
      </div>
    </>
  );
}
