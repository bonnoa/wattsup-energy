import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Inscription · WattsUp Energy" };

export default function InscriptionPage() {
  return (
    <Suspense>
      <AuthForm mode="inscription" />
    </Suspense>
  );
}
