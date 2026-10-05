"use client";

import { useRouter } from "next/navigation";
import { button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

/** Déconnexion : icône dans la barre latérale, bouton libellé sur la page Compte. */
export function SignOutButton({ variant = "sidebar" }: { variant?: "sidebar" | "page" }) {
  const router = useRouter();
  const signOut = async () => {
    await authClient.signOut();
    router.replace("/connexion");
    router.refresh();
  };
  const icon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
  if (variant === "page") {
    return (
      <button type="button" onClick={signOut} className={`${button.secondary} self-start`}>
        {icon}
        Se déconnecter
      </button>
    );
  }
  return (
    <button
      type="button"
      title="Se déconnecter"
      aria-label="Se déconnecter"
      onClick={signOut}
      className="flex size-8 items-center justify-center rounded-[8px] text-[#7D817A] hover:bg-bg/[0.08] hover:text-bg"
    >
      {icon}
    </button>
  );
}
