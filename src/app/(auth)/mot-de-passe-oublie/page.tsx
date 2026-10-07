import { redirect } from "next/navigation";
import { mailConfigured } from "@/server/mail";
import { ForgotPasswordForm } from "../password-forms";

export const metadata = { title: "Mot de passe oublié · WattsUp Energy" };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  // Sans envoi d'emails configuré, la page n'a pas lieu d'être.
  if (!mailConfigured()) redirect("/connexion");
  return <ForgotPasswordForm />;
}
