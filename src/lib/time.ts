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

function intlParts(instant: Date, timeZone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday ?? ""] ?? 0,
  };
}

// Intl est lent (plusieurs dizaines de µs par appel) et un calcul de page convertit des
// centaines de milliers d'instants. Le décalage d'un fuseau ne change qu'aux changements
// d'heure, toujours sur un quart d'heure UTC : il est calculé une fois par quart d'heure et
// gardé en mémoire (vidée au-delà d'un plafond).
const QUARTER_MS = 15 * 60_000;
const OFFSETS_MAX = 400_000;
const offsets = new Map<string, Map<number, number>>();

/** Décalage du fuseau (minutes, heure locale − UTC) pour le quart d'heure de l'instant. */
function offsetMinutes(ms: number, timeZone: string): number {
  const quarter = Math.floor(ms / QUARTER_MS);
  let zone = offsets.get(timeZone);
  if (!zone) {
    zone = new Map();
    offsets.set(timeZone, zone);
  }
  let offset = zone.get(quarter);
  if (offset === undefined) {
    const at = quarter * QUARTER_MS;
    const p = intlParts(new Date(at), timeZone);
    offset = Math.round(
      (Date.parse(`${p.date}T00:00:00Z`) + (p.hour * 60 + p.minute) * 60_000 - at) / 60_000,
    );
    if (zone.size >= OFFSETS_MAX) zone.clear();
    zone.set(quarter, offset);
  }
  return offset;
}

const DAY_LENGTH_MS = 86_400_000;
/** Chaîne AAAA-MM-JJ de chaque jour déjà rencontré (index : jours depuis 1970-01-01). */
const dayStrings = new Map<number, string>();

export function localParts(instant: Date, timeZone: string): LocalParts {
  const ms = instant.getTime();
  const local = ms + offsetMinutes(ms, timeZone) * 60_000;
  const day = Math.floor(local / DAY_LENGTH_MS);
  let date = dayStrings.get(day);
  if (date === undefined) {
    date = new Date(day * DAY_LENGTH_MS).toISOString().slice(0, 10);
    if (dayStrings.size >= OFFSETS_MAX) dayStrings.clear();
    dayStrings.set(day, date);
  }
  const minutes = Math.floor((local - day * DAY_LENGTH_MS) / 60_000);
  return {
    date,
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
    // Le 1er janvier 1970 était un jeudi (4).
    weekday: ((((day + 3) % 7) + 7) % 7) + 1,
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

/** Instant UTC correspondant à `date` à `hour`:00 heure locale de `timeZone`. */
export function zonedInstant(date: string, hour: number, timeZone: string): Date {
  const target = Date.parse(`${date}T00:00:00Z`) + hour * 3_600_000;
  let guess = target;
  // Deux passes suffisent pour converger, y compris les jours de changement d'heure.
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), timeZone);
    const seen = Date.parse(`${p.date}T00:00:00Z`) + (p.hour * 60 + p.minute) * 60_000;
    guess += target - seen;
  }
  return new Date(guess);
}

/** Jour Tempo d'un instant : la journée Tempo commence à 6 h locales. */
export function tempoDay(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return p.hour < 6 ? addDays(p.date, -1) : p.date;
}
