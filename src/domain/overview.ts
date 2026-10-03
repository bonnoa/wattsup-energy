import { addDays, eachDay, zonedInstant } from "@/lib/time";

// Vue d'ensemble (SPEC §9, T20) : périodes de navigation et bilan énergétique. Pur.

export interface Period {
  kind: "month" | "year";
  /** « AAAA-MM » ou « AAAA », valeur du paramètre d'URL `p`. */
  key: string;
  /** Jours locaux [from, to) ; `to` borné au lendemain d'aujourd'hui. */
  from: string;
  to: string;
  label: string;
  /** Faux pour la période en cours (arrêtée à aujourd'hui). */
  complete: boolean;
}

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
};

const nextMonth = (key: string) => {
  const [y = 0, m = 1] = key.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const prevMonth = (key: string) => {
  const [y = 0, m = 1] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

/** Période demandée (`?p=AAAA-MM` ou `?p=AAAA`) ; à défaut, le mois en cours. */
export function parsePeriod(raw: string | undefined, today: string): Period {
  const end = addDays(today, 1);
  const thisMonth = today.slice(0, 7);
  const bounded = (natural: string) => ({
    to: natural <= end ? natural : end,
    complete: natural <= end,
  });
  const month = (key: string): Period => ({
    kind: "month",
    key,
    from: `${key}-01`,
    ...bounded(`${nextMonth(key)}-01`),
    label: monthLabel(key),
  });
  if (raw && /^\d{4}$/.test(raw) && raw <= today.slice(0, 4)) {
    return {
      kind: "year",
      key: raw,
      from: `${raw}-01-01`,
      ...bounded(`${Number(raw) + 1}-01-01`),
      label: raw,
    };
  }
  if (raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw <= thisMonth) return month(raw);
  return month(thisMonth);
}

/** Périodes voisines ayant des données (de la première donnée à aujourd'hui). */
export function periodNav(
  period: Period,
  firstDay: string,
  today: string,
): { prev: string | null; next: string | null } {
  if (period.kind === "year") {
    const y = Number(period.key);
    return {
      prev: String(y - 1) >= firstDay.slice(0, 4) ? String(y - 1) : null,
      next: String(y + 1) <= today.slice(0, 4) ? String(y + 1) : null,
    };
  }
  const prev = prevMonth(period.key);
  const next = nextMonth(period.key);
  return {
    prev: prev >= firstDay.slice(0, 7) ? prev : null,
    next: next <= today.slice(0, 7) ? next : null,
  };
}

/** Mois « AAAA-MM » d'une année, jusqu'au mois en cours. */
export function yearMonths(year: string, today: string): string[] {
  const months: string[] = [];
  for (let k = `${year}-01`; k.startsWith(year) && k <= today.slice(0, 7); k = nextMonth(k)) {
    months.push(k);
  }
  return months;
}

export interface EnergyBalance {
  gridImport: number;
  gridExport: number;
  solar: number;
  batteryCharge: number;
  batteryDischarge: number;
  /** Consommation du foyer = import + production + décharge − export − charge. */
  consumption: number;
  /** D'où vient l'énergie consommée (kWh). */
  origin: { grid: number; solar: number; battery: number };
  /** Part de la production consommée sur place (direct ou via la batterie), null sans production. */
  selfConsumptionRate: number | null;
}

/** Bilan d'une période à partir des totaux par métrique (kWh). */
export function energyBalance(
  totals: Partial<Record<string, number>>,
  opts: { batteryGridCharging: boolean },
): EnergyBalance {
  const v = (m: string) => totals[m] ?? 0;
  const gridImport = v("grid_import");
  const gridExport = v("grid_export");
  const solar = v("solar_production");
  const batteryCharge = v("battery_charge");
  const batteryDischarge = v("battery_discharge");
  const chargeFromGrid = opts.batteryGridCharging
    ? Math.min(batteryCharge, v("battery_charge_grid"))
    : 0;
  const origin = {
    grid: Math.max(0, gridImport - chargeFromGrid),
    solar: Math.max(0, solar - gridExport - (batteryCharge - chargeFromGrid)),
    battery: batteryDischarge,
  };
  return {
    gridImport,
    gridExport,
    solar,
    batteryCharge,
    batteryDischarge,
    consumption: origin.grid + origin.solar + origin.battery,
    origin,
    selfConsumptionRate: solar > 0 ? Math.max(0, solar - gridExport) / solar : null,
  };
}

/** Rendement solaire : kWh produits par kWh/m² reçu (null sans irradiation). */
export function solarYield(kwh: number, radiationKwhM2: number | null): number | null {
  return radiationKwhM2 && radiationKwhM2 > 0 ? kwh / radiationKwhM2 : null;
}

/** Jours terminés de la période (aujourd'hui exclu), null s'il n'y en a aucun. */
export function coverageWindow(period: Period, today: string): { from: string; to: string } | null {
  const to = period.to < today ? period.to : today;
  return to > period.from ? { from: period.from, to } : null;
}

/** Créneaux attendus sur [from, to) : heures réelles du fuseau (mode horaire) ou jours. */
export function expectedSlots(
  from: string,
  to: string,
  granularity: "hourly" | "daily",
  timezone: string,
): number {
  if (granularity === "daily") return eachDay(from, to).length;
  return Math.round(
    (zonedInstant(to, 0, timezone).getTime() - zonedInstant(from, 0, timezone).getTime()) /
      3_600_000,
  );
}
