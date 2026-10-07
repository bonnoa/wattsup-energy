import { Suspense } from "react";
import { ResetPasswordForm } from "../password-forms";

export const metadata = { title: "Nouveau mot de passe · WattsUp Energy" };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
