// Dates et fuseaux. Les instants sont des Date (UTC) ; les jours locaux sont des
// chaînes AAAA-MM-JJ. Aucune dépendance : Intl suffit pour les fuseaux.

export interface LocalParts {
  date: string;
  hour: number;
  minute: number;
  /** 1 = lundi … 7 = dimanche (ISO 8601). */
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday ?? ""] ?? 0,
  };
}

const DAY_MS = 86_400_000;

const toUtcMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromUtcMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Jours locaux de l'intervalle demi-ouvert [from, to). */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Jour de semaine ISO (1 = lundi) d'une date locale. */
export function weekdayOf(date: string): number {
  const d = new Date(toUtcMs(date)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

/** "HH:MM" → minutes depuis minuit. "24:00" est accepté comme fin de journée. */
export function parseHm(hm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hm);
  const h = Number(m?.[1]);
  const min = Number(m?.[2]);
  if (!m || min > 59 || h > 24 || (h === 24 && min !== 0)) {
    throw new Error(`heure invalide : ${hm}`);
  }
  return h * 60 + min;
}
