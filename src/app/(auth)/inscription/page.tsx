import Link from "next/link";
import { Suspense } from "react";
import { signupMode } from "@/server/auth";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Inscription · WattsUp Energy" };
// Le mode d'inscription est lu à chaque requête (variable d'environnement de l'instance).
export const dynamic = "force-dynamic";

export default function InscriptionPage() {
  const mode = signupMode();
  if (mode === "closed") {
    return (
      <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Inscriptions fermées</h1>
        <p className="text-sm text-muted text-pretty">
          Cette instance n&apos;accepte pas de nouveaux comptes. Demandez un accès à la personne qui
          l&apos;administre.
        </p>
        <p className="text-sm text-muted">
          Déjà inscrit ? <Link href="/connexion">Se connecter</Link>
        </p>
      </section>
    );
  }
  return (
    <Suspense>
      <AuthForm mode="inscription" inviteRequired={mode === "invite"} />
    </Suspense>
  );
}
