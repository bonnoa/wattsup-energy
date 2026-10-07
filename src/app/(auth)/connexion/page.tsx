import { Suspense } from "react";
import { getSignupPolicy } from "@/server/instance";
import { mailConfigured } from "@/server/mail";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Connexion · WattsUp Energy" };
export const dynamic = "force-dynamic";

export default async function ConnexionPage() {
  const { mode } = await getSignupPolicy();
  return (
    <Suspense>
      <AuthForm
        mode="connexion"
        signupOpen={mode !== "closed"}
        passwordReset={mailConfigured()}
      />
    </Suspense>
  );
}
