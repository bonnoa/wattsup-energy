import Image from "next/image";
import { formatEur, formatKwh } from "@/lib/format";

// Page provisoire : remplacée par la Vue d'ensemble (T4, T20).
export default function Home() {
  return (
    <main className="mx-auto flex min-h-full max-w-[1120px] flex-col gap-6 px-4 py-12">
      <div className="flex items-center gap-3">
        <Image src="/wattsup.svg" alt="WattsUp" width={36} height={36} priority />
        <span className="text-xl font-bold tracking-tight">
          WattsUp<span className="text-solar"> Energy</span>
        </span>
      </div>
      <div className="flex flex-col gap-3 rounded-card bg-ink p-6 text-bg">
        <span className="text-sm text-[#A9ADA6]">Socle technique en place</span>
        <span className="font-mono text-4xl font-medium tracking-tighter">{formatEur(1142)}</span>
        <span className="font-mono text-sm">{formatKwh(4812)}</span>
      </div>
    </main>
  );
}
