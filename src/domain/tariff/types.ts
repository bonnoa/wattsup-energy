// Contrats et entrées du moteur tarifaire (SPEC §7.1). Prix TTC en €/kWh,
// abonnement TTC en €/an.

export type Slot = "hp" | "hc";

/** Plage horaire locale "HH:MM"–"HH:MM", fin exclue ; peut passer minuit. */
export interface TimeRange {
  from: string;
  to: string;
}

export interface BaseContract {
  kind: "base";
  subscriptionEurYear: number;
  priceEurKwh: number;
}

export interface HphcContract {
  kind: "hphc";
  subscriptionEurYear: number;
  prices: Record<Slot, number>;
  hcRanges: TimeRange[];
}

export type Contract = BaseContract | HphcContract;

export type PriceableInterval =
  | { granularity: "hour"; start: Date; kwh: number }
  | { granularity: "day"; date: string; slot: Slot | null; kwh: number };

export interface PricingContext {
  timezone: string;
  /** Période d'abonnement, jours locaux [from, to). */
  period: { from: string; to: string };
}

export interface MonthBreakdown {
  energyCents: number;
  subscriptionCents: number;
  kwh: number;
}

export interface PricedResult {
  /** energyCents + subscriptionCents. */
  totalCents: number;
  /** Arrondi une seule fois sur la somme exacte : la somme des mois peut différer d'un centime. */
  energyCents: number;
  subscriptionCents: number;
  kwh: number;
  /** Clé AAAA-MM (mois local). */
  byMonth: Record<string, MonthBreakdown>;
  /** Clés : "base", "hp", "hc", puis les créneaux propres à chaque type de contrat. */
  bySlot: Record<string, { kwh: number; energyCents: number }>;
  /** kWh dont la ventilation a dû être supposée (total journalier sans créneau). */
  approximatedKwh: number;
}
