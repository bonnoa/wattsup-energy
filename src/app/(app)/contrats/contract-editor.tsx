"use client";

import { useState, useTransition } from "react";
import { CONTRACT_PRESETS, type ContractInput } from "@/domain/tariff/schema";
import type { Contract, CustomRule, TempoColor, TimeRange } from "@/domain/tariff/types";
import { saveContractAction } from "@/server/actions/contracts";
import { KIND_LABELS } from "./labels";

const DAYS = ["L", "M", "M", "J", "V", "S", "D"];
const DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const COLORS: { id: TempoColor; label: string; dot: string }[] = [
  { id: "bleu", label: "Bleu", dot: "bg-grid" },
  { id: "blanc", label: "Blanc", dot: "bg-[#CFC9BB]" },
  { id: "rouge", label: "Rouge", dot: "bg-eheat" },
];

const inputClass =
  "h-10 w-full rounded-[8px] border border-border-strong bg-surface px-3 text-[13px] outline-none focus:border-ink";
const labelClass = "flex flex-col gap-1.5 text-xs text-muted";
const smallButton =
  "rounded-[8px] border border-border-strong px-2.5 py-1.5 text-xs text-[#5E625C] hover:bg-bg";

const presetFor = (kind: Contract["kind"]) =>
  structuredClone(CONTRACT_PRESETS.find((p) => p.contract.kind === kind) as ContractInput);

/** Champ décimal : accepte la virgule, garde la saisie telle quelle tant qu'elle est incomplète. */
function DecimalField({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value).replace(".", ",") : "");
  return (
    <label className={labelClass}>
      {label}
      <span className="flex items-center gap-2">
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(Number(e.target.value.replace(",", ".").trim() || "NaN"));
          }}
          className={`${inputClass} text-right font-mono`}
        />
        <span className="w-14 flex-none text-[11px] text-subtle">{unit}</span>
      </span>
    </label>
  );
}

function RangesField({
  ranges,
  onChange,
}: {
  ranges: TimeRange[];
  onChange: (r: TimeRange[]) => void;
}) {
  const set = (i: number, patch: Partial<TimeRange>) =>
    onChange(ranges.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2">
      {ranges.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="time"
            step={1800}
            value={r.from}
            onChange={(e) => set(i, { from: e.target.value })}
            className={inputClass}
            aria-label="Début"
          />
          <span className="text-subtle">→</span>
          <input
            type="time"
            step={1800}
            value={r.to === "24:00" ? "00:00" : r.to}
            onChange={(e) => set(i, { to: e.target.value === "00:00" ? "24:00" : e.target.value })}
            className={inputClass}
            aria-label="Fin"
          />
          {ranges.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(ranges.filter((_, j) => j !== i))}
              className={smallButton}
              aria-label="Retirer la plage"
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...ranges, { from: "12:00", to: "14:00" }])}
        className={`${smallButton} self-start`}
      >
        + Plage
      </button>
    </div>
  );
}

function RuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: CustomRule;
  onChange: (r: CustomRule) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-border p-3">
      <div className="flex items-end gap-2">
        <label className={`${labelClass} flex-1`}>
          Libellé
          <input
            value={rule.label}
            onChange={(e) => onChange({ ...rule, label: e.target.value })}
            className={inputClass}
          />
        </label>
        {onRemove && (
          <button type="button" onClick={onRemove} className={`${smallButton} h-10`}>
            Retirer
          </button>
        )}
      </div>
      <div className="flex gap-1" role="group" aria-label="Jours">
        {DAYS.map((d, i) => {
          const day = i + 1;
          const on = rule.days.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              aria-label={DAY_NAMES[i]}
              onClick={() =>
                onChange({
                  ...rule,
                  days: on ? rule.days.filter((x) => x !== day) : [...rule.days, day].sort(),
                })
              }
              className={`size-9 rounded-[8px] text-xs font-medium ${on ? "bg-ink text-bg" : "bg-chip"}`}
            >
              {d}
            </button>
          );
        })}
      </div>
      <RangesField ranges={rule.ranges} onChange={(ranges) => onChange({ ...rule, ranges })} />
      <DecimalField
        label="Prix"
        value={rule.price}
        unit="€/kWh"
        onChange={(price) => onChange({ ...rule, price })}
      />
    </div>
  );
}

interface Props {
  id: string | null;
  initial: ContractInput;
  onDone: () => void;
}

export function ContractEditor({ id, initial, onDone }: Props) {
  const [name, setName] = useState(initial.name);
  const [contract, setContract] = useState<Contract>(initial.contract);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  // Remonter les champs décimaux quand le type change (leur texte est local).
  const [formKey, setFormKey] = useState(0);

  const switchKind = (kind: Contract["kind"]) => {
    if (kind === contract.kind) return;
    setContract(presetFor(kind).contract);
    setFormKey((k) => k + 1);
  };

  const save = () =>
    startTransition(async () => {
      const res = await saveContractAction(id, { name, contract });
      if (res.ok) onDone();
      else setErrors(res.errors.map((e) => e.message));
    });

  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
      <h2 className="text-[15px] font-semibold">
        {id ? "Modifier le contrat" : "Nouveau contrat"}
      </h2>

      <label className={labelClass}>
        Nom
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">Type</span>
        <div role="radiogroup" className="flex gap-1 rounded-[10px] bg-chip p-[3px]">
          {(Object.keys(KIND_LABELS) as Contract["kind"][]).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={contract.kind === kind}
              onClick={() => switchKind(kind)}
              className={`flex-1 rounded-[8px] px-2 py-2 text-[13px] font-medium ${
                contract.kind === kind ? "bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : ""
              }`}
            >
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      </div>

      <div key={formKey} className="flex flex-col gap-4">
        <DecimalField
          label="Abonnement"
          value={contract.subscriptionEurYear}
          unit="€/an"
          onChange={(subscriptionEurYear) => setContract({ ...contract, subscriptionEurYear })}
        />

        {contract.kind === "base" && (
          <DecimalField
            label="Prix du kWh"
            value={contract.priceEurKwh}
            unit="€/kWh"
            onChange={(priceEurKwh) => setContract({ ...contract, priceEurKwh })}
          />
        )}

        {contract.kind === "hphc" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <DecimalField
                label="Heures pleines"
                value={contract.prices.hp}
                unit="€/kWh"
                onChange={(hp) => setContract({ ...contract, prices: { ...contract.prices, hp } })}
              />
              <DecimalField
                label="Heures creuses"
                value={contract.prices.hc}
                unit="€/kWh"
                onChange={(hc) => setContract({ ...contract, prices: { ...contract.prices, hc } })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Plages d&apos;heures creuses</span>
              <RangesField
                ranges={contract.hcRanges}
                onChange={(hcRanges) => setContract({ ...contract, hcRanges })}
              />
            </div>
          </>
        )}

        {contract.kind === "tempo" && (
          <div className="flex flex-col gap-3">
            <span className="text-xs text-muted">
              Heures creuses de 22 h à 6 h, fixées par Tempo.
            </span>
            {COLORS.map((c) => (
              <div key={c.id} className="grid grid-cols-[72px_1fr_1fr] items-end gap-3">
                <span className="flex h-10 items-center gap-2 text-[13px] font-medium">
                  <span className={`size-2.5 rounded-[3px] ${c.dot}`} />
                  {c.label}
                </span>
                {(["hp", "hc"] as const).map((slot) => (
                  <DecimalField
                    key={slot}
                    label={slot === "hp" ? "HP" : "HC"}
                    value={contract.prices[c.id][slot]}
                    unit="€/kWh"
                    onChange={(v) =>
                      setContract({
                        ...contract,
                        prices: {
                          ...contract.prices,
                          [c.id]: { ...contract.prices[c.id], [slot]: v },
                        },
                      })
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {contract.kind === "custom" && (
          <div className="flex flex-col gap-3">
            <span className="text-xs text-muted">
              Règles appliquées dans l&apos;ordre : la première qui couvre un moment fixe son prix.
              Chaque minute de la semaine doit être couverte.
            </span>
            {contract.rules.map((rule, i) => (
              <RuleEditor
                key={i}
                rule={rule}
                onChange={(r) =>
                  setContract({
                    ...contract,
                    rules: contract.rules.map((x, j) => (j === i ? r : x)),
                  })
                }
                onRemove={
                  contract.rules.length > 1
                    ? () =>
                        setContract({
                          ...contract,
                          rules: contract.rules.filter((_, j) => j !== i),
                        })
                    : undefined
                }
              />
            ))}
            <button
              type="button"
              onClick={() =>
                setContract({
                  ...contract,
                  rules: [
                    ...contract.rules,
                    {
                      label: `Règle ${contract.rules.length + 1}`,
                      days: [1, 2, 3, 4, 5, 6, 7],
                      ranges: [{ from: "00:00", to: "24:00" }],
                      price: 0.2,
                    },
                  ],
                })
              }
              className={`${smallButton} self-start`}
            >
              + Règle
            </button>
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-negative">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="flex h-10 items-center rounded-[8px] bg-ink px-4 text-[13px] font-medium text-bg disabled:opacity-60"
        >
          Enregistrer
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex h-10 items-center rounded-[8px] border border-border-strong px-4 text-[13px] text-[#5E625C] hover:bg-bg"
        >
          Annuler
        </button>
      </div>
    </section>
  );
}
