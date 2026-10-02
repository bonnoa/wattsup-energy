"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/connexion");
        router.refresh();
      }}
      className="rounded-[8px] border border-border-strong px-3 py-2 text-sm text-muted hover:bg-surface"
    >
      Se déconnecter
    </button>
  );
}
