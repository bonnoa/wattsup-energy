import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Connexion · WattsUp Energy" };

export default function ConnexionPage() {
  return (
    <Suspense>
      <AuthForm mode="connexion" />
    </Suspense>
  );
}
