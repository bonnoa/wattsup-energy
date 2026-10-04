import { Suspense } from "react";
import { signupMode } from "@/server/auth";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Connexion · WattsUp Energy" };
export const dynamic = "force-dynamic";

export default function ConnexionPage() {
  return (
    <Suspense>
      <AuthForm mode="connexion" signupOpen={signupMode() !== "closed"} />
    </Suspense>
  );
}
