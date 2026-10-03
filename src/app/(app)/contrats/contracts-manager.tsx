"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CONTRACT_PRESETS, type ContractInput } from "@/domain/tariff/schema";
import type { Contract } from "@/domain/tariff/types";
import {
  createContractAction,
  deleteContractAction,
  deletePricePeriodAction,
  duplicateContractAction,
  savePricePeriodAction,
  switchContractAction,
  updateContractAction,
  type ActionResult,
} from "@/server/actions/contracts";
import {
  Errors,
  FormButtons,
  GridFields,
  inputClass,
  labelClass,
  SubscriptionFields,
  type SubscriptionValue,
} from "./contract-editor";
import { KIND_LABELS } from "./labels";

export interface ContractItem {
  id: string;
  name: string;
  kind: Contract["kind"];
  status: "subscribed" | "simulated";
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  /** Du plus ancien au plus récent. */
  periods: { id: string; validFrom: string; contract: Contract }[];
}

const price = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const eur = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const todayIso = () => new Date().toISOString().slice(0, 10);

function summary(c: Contract): string {
  switch (c.kind) {
    case "base":
      return `${price(c.priceEurKwh)} €/kWh`;
    case "hphc":
      return `HP ${price(c.prices.hp)} · HC ${price(c.prices.hc)} · ${c.hcRanges.map((r) => `${r.from}–${r.to}`).join(", ")}`;
    case "tempo":
      return `Bleu ${price(c.prices.bleu.hp)} · Rouge HP ${price(c.prices.rouge.hp)} €/kWh`;
    case "custom":
      return c.rules.map((r) => `${r.label} ${price(r.price)}`).join(" · ");
  }
}

function dates(item: ContractItem): string {
  if (item.status === "simulated" || !item.startDate) return "offre à comparer";
  if (!item.endDate) return `depuis le ${fmtDate(item.startDate)}`;
  return `du ${fmtDate(item.startDate)} au ${fmtDate(item.endDate)}`;
}

type Period = { id: string | null; validFrom: string; contract: Contract };
type Editing =
  | { mode: "presets" }
  | { mode: "create"; initial: ContractInput }
  | { mode: "identity"; item: ContractItem }
  | { mode: "period"; item: ContractItem; period: Period }
  | null;

function useSubmit(onDone: () => void) {
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const submit = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) onDone();
      else setErrors(res.errors);
    });
  return { errors, pending, submit };
}

const card = "flex flex-col gap-4 rounded-card border border-border bg-surface p-5";

function CreateForm({
  initial,
  subscribed,
  onDone,
}: {
  initial: ContractInput;
  subscribed: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [contract, setContract] = useState(initial.contract);
  const [subscription, setSubscription] = useState<SubscriptionValue | null>(
    subscribed ? { startDate: todayIso(), endDate: null } : null,
  );
  const { errors, pending, submit } = useSubmit(onDone);
  return (
    <section className={card}>
      <h2 className="text-[15px] font-semibold">Nouveau contrat</h2>
      <label className={labelClass}>
        Nom
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </label>
      <SubscriptionFields value={subscription} onChange={setSubscription} />
      <GridFields contract={contract} onChange={setContract} />
      <Errors errors={errors} />
      <FormButtons
        pending={pending}
        onCancel={onDone}
        onSave={() => submit(() => createContractAction({ name, contract, subscription }))}
      />
    </section>
  );
}

function IdentityForm({ item, onDone }: { item: ContractItem; onDone: () => void }) {
  const [name, setName] = useState(item.name);
  const [subscription, setSubscription] = useState<SubscriptionValue | null>(
    item.status === "subscribed" && item.startDate
      ? { startDate: item.startDate, endDate: item.endDate }
      : null,
  );
  const { errors, pending, submit } = useSubmit(onDone);
  return (
    <section className={card}>
      <h2 className="text-[15px] font-semibold">Nom et dates · {item.name}</h2>
      <label className={labelClass}>
        Nom
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </label>
      <SubscriptionFields value={subscription} onChange={setSubscription} />
      <Errors errors={errors} />
      <FormButtons
        pending={pending}
        onCancel={onDone}
        onSave={() => submit(() => updateContractAction(item.id, { name, subscription }))}
      />
    </section>
  );
}

function PeriodForm({
  item,
  period,
  onDone,
}: {
  item: ContractItem;
  period: Period;
  onDone: () => void;
}) {
  const [validFrom, setValidFrom] = useState(period.validFrom);
  const [contract, setContract] = useState(period.contract);
  const { errors, pending, submit } = useSubmit(onDone);
  return (
    <section className={card}>
      <h2 className="text-[15px] font-semibold">
        {period.id ? "Modifier les prix" : "Nouveaux prix"} · {item.name}
      </h2>
      {item.status === "subscribed" && (
        <label className={labelClass}>
          {period.id ? "En vigueur à partir du" : "Nouveaux prix à partir du"}
          <input
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            className={inputClass}
          />
        </label>
      )}
      <GridFields contract={contract} onChange={setContract} kindLocked />
      <Errors errors={errors} />
      <FormButtons
        pending={pending}
        onCancel={onDone}
        onSave={() =>
          submit(() => savePricePeriodAction(item.id, period.id, { validFrom, contract }))
        }
      />
    </section>
  );
}

const link = "text-grid hover:text-ink disabled:opacity-60";
const danger = "text-negative hover:text-ink disabled:opacity-60";

function PriceHistory({
  item,
  onEdit,
  onAct,
  pending,
}: {
  item: ContractItem;
  onEdit: (e: Editing) => void;
  onAct: (fn: () => Promise<ActionResult>) => void;
  pending: boolean;
}) {
  return (
    <ul className="flex flex-col gap-1.5 border-l-2 border-track pl-3">
      {[...item.periods].reverse().map((p) => (
        <li key={p.id} className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium">à partir du {fmtDate(p.validFrom)}</span>
          <span className="font-mono text-[11px] text-subtle">{summary(p.contract)}</span>
          <span className="flex gap-3 text-[11px]">
            <button
              type="button"
              className={link}
              onClick={() => onEdit({ mode: "period", item, period: p })}
            >
              Modifier
            </button>
            {item.periods.length > 1 && (
              <button
                type="button"
                disabled={pending}
                className={danger}
                onClick={() => {
                  if (confirm("Supprimer cette grille de prix ?"))
                    onAct(() => deletePricePeriodAction(p.id));
                }}
              >
                Supprimer
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ContractCard({
  item,
  onEdit,
  onAct,
  pending,
}: {
  item: ContractItem;
  onEdit: (e: Editing) => void;
  onAct: (fn: () => Promise<ActionResult>) => void;
  pending: boolean;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [switchDate, setSwitchDate] = useState<string | null>(null);
  const latest = item.periods.at(-1);
  if (!latest) return null;
  const subscribed = item.status === "subscribed";

  return (
    <li className="flex flex-col gap-2 rounded-[10px] px-3 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{item.name}</span>
        <span className="rounded-[5px] bg-track px-1.5 py-0.5 text-[11px] text-[#5E625C]">
          {KIND_LABELS[item.kind]}
        </span>
        {item.isCurrent && (
          <span className="rounded-[5px] bg-grid px-1.5 py-0.5 text-[11px] text-white">Actuel</span>
        )}
        <span className="ml-auto font-mono text-xs text-muted">
          {eur(latest.contract.subscriptionEurYear)} €/an
        </span>
      </div>
      <span className="text-[11px] text-muted">{dates(item)}</span>
      <span className="font-mono text-[11px] text-subtle">{summary(latest.contract)}</span>

      {subscribed && (
        <button
          type="button"
          className="self-start text-[11px] text-muted hover:text-ink"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? "Masquer" : "Voir"} l&apos;historique des prix ({item.periods.length}{" "}
          {item.periods.length > 1 ? "grilles" : "grille"})
        </button>
      )}
      {showHistory && <PriceHistory item={item} onEdit={onEdit} onAct={onAct} pending={pending} />}

      {switchDate !== null ? (
        <div className="flex flex-wrap items-end gap-2 rounded-[10px] bg-bg p-3">
          <label className={`${labelClass} flex-1`}>
            Souscrit à partir du
            <input
              type="date"
              value={switchDate}
              onChange={(e) => setSwitchDate(e.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="button"
            disabled={pending || !switchDate}
            onClick={() => onAct(() => switchContractAction(item.id, switchDate))}
            className="flex h-10 items-center rounded-[8px] bg-ink px-3.5 text-[13px] font-medium text-bg disabled:opacity-60"
          >
            Confirmer
          </button>
          <button
            type="button"
            onClick={() => setSwitchDate(null)}
            className="h-10 px-2 text-xs text-muted"
          >
            Annuler
          </button>
          <p className="w-full text-[11px] text-subtle">
            Le contrat actuel sera clos la veille de cette date.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {subscribed ? (
            <button
              type="button"
              className={link}
              onClick={() =>
                onEdit({
                  mode: "period",
                  item,
                  period: { id: null, validFrom: todayIso(), contract: latest.contract },
                })
              }
            >
              Nouveaux prix à partir du…
            </button>
          ) : (
            <>
              <button
                type="button"
                className={link}
                onClick={() => onEdit({ mode: "period", item, period: latest })}
              >
                Modifier les prix
              </button>
              <button type="button" className={link} onClick={() => setSwitchDate(todayIso())}>
                Je l&apos;ai souscrit le…
              </button>
            </>
          )}
          <button type="button" className={link} onClick={() => onEdit({ mode: "identity", item })}>
            Nom et dates
          </button>
          <button
            type="button"
            disabled={pending}
            className={link}
            onClick={() => onAct(() => duplicateContractAction(item.id))}
          >
            Dupliquer
          </button>
          <button
            type="button"
            disabled={pending}
            className={danger}
            onClick={() => {
              if (confirm(`Supprimer « ${item.name} » et son historique ?`)) {
                onAct(() => deleteContractAction(item.id));
              }
            }}
          >
            Supprimer
          </button>
        </div>
      )}
    </li>
  );
}

export function ContractsManager({ contracts }: { contracts: ContractItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const done = () => {
    setEditing(null);
    router.refresh();
  };
  const act = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const res = await fn();
      setErrors(res.ok ? [] : res.errors);
      router.refresh();
    });

  if (editing?.mode === "create") {
    return (
      <CreateForm
        initial={editing.initial}
        subscribed={!contracts.some((c) => c.isCurrent)}
        onDone={done}
      />
    );
  }
  if (editing?.mode === "identity") return <IdentityForm item={editing.item} onDone={done} />;
  if (editing?.mode === "period") {
    return <PeriodForm item={editing.item} period={editing.period} onDone={done} />;
  }

  const groups = [
    { title: "Contrat actuel", items: contracts.filter((c) => c.isCurrent) },
    {
      title: "Contrats précédents",
      items: contracts.filter((c) => c.status === "subscribed" && !c.isCurrent),
    },
    { title: "Offres à comparer", items: contracts.filter((c) => c.status === "simulated") },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {contracts.length === 0 && editing?.mode !== "presets" && (
        <p className="rounded-card border border-dashed border-[#CFC9BB] bg-surface p-5 text-sm text-muted">
          Ajoutez votre contrat actuel (avec sa date de début) pour commencer, puis les offres à
          comparer.
        </p>
      )}
      <Errors errors={errors} />
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-1">
          <h2 className="px-1 text-xs font-medium tracking-wide text-muted uppercase">{g.title}</h2>
          <ul className="flex flex-col rounded-card border border-border bg-surface p-2">
            {g.items.map((item) => (
              <ContractCard
                key={item.id}
                item={item}
                onEdit={setEditing}
                onAct={act}
                pending={pending}
              />
            ))}
          </ul>
        </section>
      ))}

      {editing?.mode === "presets" ? (
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
                onClick={() => setEditing({ mode: "create", initial: structuredClone(p) })}
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
          onClick={() => setEditing({ mode: "presets" })}
          className="rounded-[10px] border border-dashed border-[#CFC9BB] p-3 text-center text-[13px] text-[#5E625C] hover:bg-surface"
        >
          + Ajouter un contrat
        </button>
      )}
    </div>
  );
}
