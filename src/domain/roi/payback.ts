import { addDays } from "@/lib/time";

// Amortissement (SPEC §7.2) : économie mensuelle moyenne sur les 12 derniers mois,
// date d'amortissement = aujourd'hui + (coût − économies cumulées) / économie mensuelle.

export interface Payback {
  /** Part du coût déjà remboursée, 0–1 (plafonnée à 1). */
  ratio: number;
  cumulativeCents: number;
  /** Moyenne des 12 derniers mois (ou des mois disponibles). */
  monthlyCents: number;
  /** null : déjà amorti, ou aucune économie mensuelle positive. */
  paybackDate: string | null;
  status: "amortized" | "in-progress" | "no-savings";
}

const DAYS_PER_MONTH = 365.25 / 12;

/**
 * @param byMonth économies par mois « AAAA-MM », depuis l'installation.
 * @param currentMonth mois en cours (exclu de la moyenne : il est incomplet).
 */
export function payback(input: {
  costEur: number;
  byMonth: Record<string, number>;
  currentMonth: string;
  today: string;
}): Payback {
  const months = Object.keys(input.byMonth).sort();
  const cumulativeCents = months.reduce((a, m) => a + (input.byMonth[m] ?? 0), 0);
  const complete = months.filter((m) => m < input.currentMonth).slice(-12);
  const monthlyCents =
    complete.length > 0
      ? complete.reduce((a, m) => a + (input.byMonth[m] ?? 0), 0) / complete.length
      : 0;
  const costCents = input.costEur * 100;
  const ratio = costCents > 0 ? Math.min(1, Math.max(0, cumulativeCents / costCents)) : 1;
  if (cumulativeCents >= costCents) {
    return { ratio, cumulativeCents, monthlyCents, paybackDate: null, status: "amortized" };
  }
  if (monthlyCents <= 0) {
    return { ratio, cumulativeCents, monthlyCents, paybackDate: null, status: "no-savings" };
  }
  const monthsLeft = (costCents - cumulativeCents) / monthlyCents;
  return {
    ratio,
    cumulativeCents,
    monthlyCents,
    paybackDate: addDays(input.today, Math.ceil(monthsLeft * DAYS_PER_MONTH)),
    status: "in-progress",
  };
}
