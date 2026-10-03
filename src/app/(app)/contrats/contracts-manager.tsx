"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CONTRACT_PRESETS, type ContractInput } from "@/domain/tariff/schema";
import type { Contract } from "@/domain/tariff/types";
import {
  deleteContractAction,
  duplicateContractAction,
  setCurrentContractAction,
} from "@/server/actions/contracts";
import { ContractEditor, KIND_LABELS } from "./contract-editor";

export interface ContractItem {
  id: string;
  name: string;
  isCurrent: boolean;
  contract: Contract;
}

const price = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const eur = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function summary(c: Contract): string {
  switch (c.kind) {
    case "base":
      return `${price(c.priceEurKwh)} €/kWh`;
    case "hphc":
      return `HP ${price(c.prices.hp)} · HC ${price(c.prices.hc)} · ${c.hcRanges
        .map((r) => `${r.from}–${r.to}`)
        .join(", ")}`;
    case "tempo":
      return `Bleu ${price(c.prices.bleu.hp)} · Rouge HP ${price(c.prices.rouge.hp)} €/kWh`;
    case "custom":
      return c.rules.map((r) => `${r.label} ${price(r.price)}`).join(" · ");
  }
}

type Editing = { id: string | null; initial: ContractInput } | "presets" | null;

export function ContractsManager({ contracts }: { contracts: ContractItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [pending, startTransition] = useTransition();

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  if (editing && editing !== "presets") {
    return (
      <ContractEditor
        key={editing.id ?? "new"}
        id={editing.id}
        initial={editing.initial}
        onDone={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {contracts.length === 0 && editing !== "presets" && (
        <p className="rounded-card border border-dashed border-[#CFC9BB] bg-surface p-5 text-sm text-muted">
          Ajoutez votre contrat actuel pour commencer, puis les offres à comparer.
        </p>
      )}

      {contracts.length > 0 && (
        <ul className="flex flex-col rounded-card border border-border bg-surface p-2">
          {contracts.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-[10px] px-3 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{c.name}</span>
                <span className="rounded-[5px] bg-track px-1.5 py-0.5 text-[11px] text-[#5E625C]">
                  {KIND_LABELS[c.contract.kind]}
                </span>
                {c.isCurrent && (
                  <span className="rounded-[5px] bg-grid px-1.5 py-0.5 text-[11px] text-white">
                    Actuel
                  </span>
                )}
                <span className="ml-auto font-mono text-xs text-muted">
                  {eur(c.contract.subscriptionEurYear)} €/an
                </span>
              </div>
              <span className="font-mono text-[11px] text-subtle">{summary(c.contract)}</span>
              <div className="flex flex-wrap gap-3 text-xs">
                <button
                  type="button"
                  className="text-grid hover:text-ink"
                  onClick={() =>
                    setEditing({ id: c.id, initial: { name: c.name, contract: c.contract } })
                  }
                >
                  Modifier
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="text-grid hover:text-ink"
                  onClick={() => act(() => duplicateContractAction(c.id))}
                >
                  Dupliquer
                </button>
                {!c.isCurrent && (
                  <button
                    type="button"
                    disabled={pending}
                    className="text-grid hover:text-ink"
                    onClick={() => act(() => setCurrentContractAction(c.id))}
                  >
                    Définir comme actuel
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  className="text-negative hover:text-ink"
                  onClick={() => {
                    if (confirm(`Supprimer « ${c.name} » ?`)) act(() => deleteContractAction(c.id));
                  }}
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing === "presets" ? (
        <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
          <h2 className="text-[15px] font-semibold">Partir d&apos;une offre de référence</h2>
          <p className="text-xs text-subtle">
            Grilles TTC indicatives (9 kVA) : vérifiez les prix sur votre facture ou chez votre
            fournisseur avant d&apos;enregistrer.
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-2">
            {CONTRACT_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setEditing({ id: null, initial: structuredClone(p) })}
                className="flex flex-col items-start gap-1 rounded-[10px] border border-border p-3 text-left hover:bg-bg"
              >
                <span className="text-sm font-medium">{p.name}</span>
                <span className="text-[11px] text-subtle">{KIND_LABELS[p.contract.kind]}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="self-start text-xs text-muted hover:text-ink"
          >
            Annuler
          </button>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setEditing("presets")}
          className="rounded-[10px] border border-dashed border-[#CFC9BB] p-3 text-center text-[13px] text-[#5E625C] hover:bg-surface"
        >
          + Ajouter un contrat
        </button>
      )}
    </div>
  );
}
