"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      title="Se déconnecter"
      aria-label="Se déconnecter"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/connexion");
        router.refresh();
      }}
      className="flex size-8 items-center justify-center rounded-[8px] text-[#7D817A] hover:bg-bg/[0.08] hover:text-bg"
    >
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
    </button>
  );
}
