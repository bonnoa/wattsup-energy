import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { ensureHousehold } from "@/server/household";
import { SignOutButton } from "./sign-out-button";

// Page provisoire : remplacée par la Vue d'ensemble (T4, T20).
export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion");
  const home = await ensureHousehold(session.user.id);

  return (
    <main className="mx-auto flex min-h-full max-w-[1120px] flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Image src="/wattsup.svg" alt="WattsUp" width={36} height={36} priority />
          <span className="text-xl font-bold tracking-tight">
            WattsUp<span className="text-solar"> Energy</span>
          </span>
        </div>
        <SignOutButton />
      </div>
      <div className="flex flex-col gap-2 rounded-card bg-ink p-6 text-bg">
        <span className="text-sm text-[#A9ADA6]">Bonjour {session.user.name}</span>
        <span className="text-2xl font-semibold">{home.name}</span>
        <span className="font-mono text-xs text-[#7D817A]">
          {home.timezone} · mode {home.granularity === "hourly" ? "horaire" : "quotidien"}
        </span>
      </div>
    </main>
  );
}
