// Générateur de données de démo (T15) : fonction pure et déterministe. Profil inspiré
// du persona du PRD (3,2 kWc, batterie de 5,12 kWh, chauffe-eau routé, appoint
// électrique), climat de type Nantes. Les grandeurs ne sont pas arrondies : le bilan
// énergétique est exact à chaque heure (l'arrondi a lieu à l'insertion en base).

import { eachDay, localParts, weekdayOf, zonedInstant } from "../../src/lib/time";

export interface DemoConfig {
  solarKwc: number;
  batteryKwh: number;
  batteryMaxChargeKwh: number;
  batteryMaxDischargeKwh: number;
  batteryEfficiency: number;
}

export const DEFAULT_CONFIG: DemoConfig = {
  solarKwc: 3.2,
  batteryKwh: 5.12,
  batteryMaxChargeKwh: 1.5,
  batteryMaxDischargeKwh: 1.2,
  batteryEfficiency: 0.95,
};

export interface DemoDay {
  date: string;
  tMin: number;
  tMax: number;
  tMean: number;
  sunshineS: number;
  radiationMjM2: number;
}

export interface DemoHour {
  start: Date;
  localDate: string;
  localHour: number;
  load: number;
  waterHeater: number;
  electricHeating: number;
  solar: number;
  gridImport: number;
  gridExport: number;
  batteryCharge: number;
  batteryDischarge: number;
  /** État de charge en fin d'heure, kWh stockés. */
  batterySoc: number;
}

interface Options {
  /** Jours locaux [from, to). */
  from: string;
  to: string;
  timezone: string;
  seed: number;
  config?: DemoConfig;
}

/** PRNG mulberry32 : reproductible, suffisant pour des données de démo. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = 2 * Math.PI;
const dayOfYear = (date: string) =>
  Math.floor(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${date.slice(0, 4)}-01-01T00:00:00Z`)) /
      86_400_000,
  ) + 1;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Durée du jour (h) : ~8,3 h en décembre, ~16 h en juin à 47° N. */
const daylightHours = (doy: number) => 12.1 + 3.9 * Math.sin((TAU * (doy - 80)) / 365);

function generateDays(dates: string[], rand: () => number): DemoDay[] {
  let anomaly = 0;
  return dates.map((date) => {
    const doy = dayOfYear(date);
    const seasonal = Math.sin((TAU * (doy - 110)) / 365); // -1 en janvier, +1 en juillet
    anomaly = 0.7 * anomaly + (rand() - 0.5) * 3; // anomalies qui persistent quelques jours
    const tMean = 12.5 + 7.5 * seasonal + anomaly;
    const tMin = tMean - (3 + 3 * rand());
    const tMax = tMean + (3 + 4 * rand());
    const clearness = clamp(0.5 + 0.2 * seasonal + (rand() - 0.5) * 0.7, 0.05, 0.95);
    const daylight = daylightHours(doy);
    const clearSkyMj = 5 + 27 * (0.5 + 0.5 * Math.sin((TAU * (doy - 80)) / 365));
    return {
      date,
      tMin,
      tMax,
      tMean,
      sunshineS: daylight * 3600 * clearness,
      radiationMjM2: clearSkyMj * (0.25 + 0.75 * clearness),
    };
  });
}

export function generateDemo({ from, to, timezone, seed, config = DEFAULT_CONFIG }: Options) {
  const rand = prng(seed);
  const days = generateDays(eachDay(from, to), rand);
  const byDate = new Map(days.map((d) => [d.date, d]));

  // Heures UTC de la période, regroupées par jour local (23 ou 25 h aux changements d'heure).
  const hoursByDate = new Map<string, { start: Date; hour: number }[]>();
  for (
    let t = zonedInstant(from, 0, timezone).getTime();
    t < zonedInstant(to, 0, timezone).getTime();
    t += 3_600_000
  ) {
    const start = new Date(t);
    const local = localParts(start, timezone);
    const list = hoursByDate.get(local.date) ?? [];
    list.push({ start, hour: local.hour });
    hoursByDate.set(local.date, list);
  }

  const hours: DemoHour[] = [];
  let soc = config.batteryKwh / 2;

  for (const day of days) {
    const slots = hoursByDate.get(day.date) ?? [];
    const doy = dayOfYear(day.date);
    const daylight = daylightHours(doy);
    const noon = 13.3; // midi solaire en heure légale, approximatif
    const bell = slots.map(({ hour }) => {
      const x = (hour + 0.5 - (noon - daylight / 2)) / daylight;
      return x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 1.5;
    });
    const bellSum = bell.reduce((a, b) => a + b, 0) || 1;
    const solarDay = (day.radiationMjM2 / 3.6) * config.solarKwc * 0.85; // ratio de performance
    const weekend = weekdayOf(day.date) >= 6;
    const routedToSolar = solarDay > 9; // le routeur chauffe l'eau à midi les beaux jours
    const heatingPerHour = day.tMean < 13 ? (13 - day.tMean) * 0.06 : 0;

    slots.forEach(({ start, hour }, i) => {
      const peak = (hour >= 7 && hour <= 8 ? 0.45 : 0) + (hour >= 19 && hour <= 21 ? 0.75 : 0);
      const daytime = weekend && hour >= 10 && hour <= 17 ? 0.2 : 0;
      const base = 0.2 + 0.25 * rand() + peak + daytime;
      const waterHeater = routedToSolar
        ? hour >= 11 && hour <= 14
          ? 0.55
          : 0
        : hour >= 2 && hour <= 4
          ? 0.73
          : 0;
      const electricHeating =
        (hour >= 6 && hour <= 8) || (hour >= 18 && hour <= 22) ? heatingPerHour : 0;
      const load = base + waterHeater + electricHeating;
      const solar = (solarDay * (bell[i] ?? 0)) / bellSum;

      let gridImport = 0;
      let gridExport = 0;
      let batteryCharge = 0;
      let batteryDischarge = 0;
      if (solar >= load) {
        const surplus = solar - load;
        const room = (config.batteryKwh - soc) / config.batteryEfficiency;
        batteryCharge = Math.min(surplus, config.batteryMaxChargeKwh, Math.max(0, room));
        soc += batteryCharge * config.batteryEfficiency;
        gridExport = surplus - batteryCharge;
      } else {
        const deficit = load - solar;
        batteryDischarge = Math.min(
          deficit,
          config.batteryMaxDischargeKwh,
          soc * config.batteryEfficiency,
        );
        soc -= batteryDischarge / config.batteryEfficiency;
        gridImport = deficit - batteryDischarge;
      }
      soc = clamp(soc, 0, config.batteryKwh);

      hours.push({
        start,
        localDate: day.date,
        localHour: hour,
        load,
        waterHeater,
        electricHeating,
        solar,
        gridImport,
        gridExport,
        batteryCharge,
        batteryDischarge,
        batterySoc: soc,
      });
    });
  }

  if (byDate.size !== days.length) throw new Error("jours en double");
  return { config, days, hours };
}

export interface DemoFuelEvent {
  fuel: "pellet" | "wood";
  type: "purchase" | "stock_snapshot" | "consumption";
  at: Date;
  qty: number;
  unit: "bag" | "stere";
  priceEur: number | null;
}

/**
 * Combustibles de démo (T24) : chaque saison, achat de 4 palettes de granulés et de 6
 * stères de bois mi-septembre, puis consommation proportionnelle aux degrés-jours
 * (≈ 0,12 sac et 0,003 stère par DJU), un relevé de départ. Déterministe.
 */
export function generateFuelEvents(days: readonly DemoDay[], timezone: string): DemoFuelEvent[] {
  const first = days[0];
  if (!first) return [];
  const events: DemoFuelEvent[] = [];
  const firstYear = Number(first.date.slice(0, 4)) - (first.date.slice(5) < "09-15" ? 1 : 0);
  const lastYear = Number((days.at(-1) ?? first).date.slice(0, 4));
  events.push({
    fuel: "pellet",
    type: "stock_snapshot",
    at: zonedInstant(`${firstYear}-09-01`, 12, timezone),
    qty: 20,
    unit: "bag",
    priceEur: null,
  });
  for (let y = firstYear; y <= lastYear; y++) {
    const at = zonedInstant(`${y}-09-15`, 12, timezone);
    const bagPrice = 6 + 0.4 * (y - firstYear);
    events.push(
      { fuel: "pellet", type: "purchase", at, qty: 264, unit: "bag", priceEur: 264 * bagPrice },
      { fuel: "wood", type: "purchase", at, qty: 6, unit: "stere", priceEur: 6 * 85 },
    );
  }
  let pellet = 0;
  let wood = 0;
  for (const day of days) {
    const md = day.date.slice(5);
    if (md > "04-30" && md < "10-01") continue;
    const dju = Math.max(0, 18 - day.tMean);
    pellet += dju * 0.12;
    wood += dju * 0.003;
    for (let i = 0; pellet >= 1; i++, pellet -= 1) {
      events.push({
        fuel: "pellet",
        type: "consumption",
        at: zonedInstant(day.date, 7 + 12 * (i % 2), timezone),
        qty: 1,
        unit: "bag",
        priceEur: null,
      });
    }
    if (wood >= 0.5) {
      wood -= 0.5;
      events.push({
        fuel: "wood",
        type: "consumption",
        at: zonedInstant(day.date, 20, timezone),
        qty: 0.5,
        unit: "stere",
        priceEur: null,
      });
    }
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}
