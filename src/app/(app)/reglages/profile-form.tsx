"use client";

import { useOptimistic, useState, useTransition } from "react";
import { PROFILE_KEYS, type EnergyProfile } from "@/domain/profile";
import { updateProfileAction } from "@/server/actions/profile";

const TOGGLES: Record<keyof EnergyProfile, { label: string; desc: string; color: string }> = {
  solar: {
    label: "Production solaire",
    desc: "Panneaux, micro-onduleurs, routeur",
    color: "bg-solar",
  },
  battery: { label: "Batterie", desc: "Cycles de charge et décharge", color: "bg-battery" },
  pellet: { label: "Granulés", desc: "Sacs et palettes de pellets", color: "bg-pellet" },
  wood: { label: "Bois", desc: "Stères, bûches", color: "bg-wood" },
  electricHeating: {
    label: "Chauffage électrique",
    desc: "Poste dédié dans la consommation",
    color: "bg-eheat",
  },
};

export function ProfileForm({ initial }: { initial: EnergyProfile }) {
  const [saved, setSaved] = useState(initial);
  const [profile, setOptimistic] = useOptimistic(saved);
  const [error, setError] = useState(false);
  const [, startTransition] = useTransition();

  const toggle = (key: keyof EnergyProfile) => {
    const next = { ...profile, [key]: !profile[key] };
    setError(false);
    startTransition(async () => {
      setOptimistic(next);
      const res = await updateProfileAction(next);
      if (res.ok) setSaved(next);
      else setError(true);
    });
  };

  return (
    <section className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-5">
      <h2 className="text-[15px] font-semibold">Profil énergétique</h2>
      <p className="pb-2 text-xs text-subtle">
        Les modules désactivés sont masqués dans toute l&apos;interface.
      </p>
      {PROFILE_KEYS.map((key) => {
        const t = TOGGLES[key];
        const on = profile[key];
        return (
          <button
            key={key}
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => toggle(key)}
            className="flex min-h-11 items-center gap-3 border-t border-track py-3 text-left"
          >
            <span className={`size-2.5 flex-none rounded-[3px] ${t.color}`} />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">{t.label}</span>
              <span className="text-xs text-subtle">{t.desc}</span>
            </span>
            <span
              className={`flex h-6 w-[42px] flex-none rounded-full p-[3px] transition-colors ${
                on ? "justify-end bg-ink" : "justify-start bg-[#D6D1C5]"
              }`}
            >
              <span className="size-[18px] rounded-full bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
            </span>
          </button>
        );
      })}
      {error && (
        <p role="alert" className="text-sm text-negative">
          Enregistrement impossible. Réessayez.
        </p>
      )}
    </section>
  );
}
