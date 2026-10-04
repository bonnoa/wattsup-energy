import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { energyInterval, household, weatherDaily } from "@/db/schema";
import { heatingCost, type HeatingCost } from "@/domain/heating/cost";
import { heatingSeason, seasonDju, seasonStarting, type HeatingSeason } from "@/domain/heating/dju";
import { seasonConsumption, toBaseQty, weightedAvgPrice, type Fuel } from "@/domain/heating/fuel";
import { visibleModules } from "@/domain/profile";
import { buildTimeline, priceTimeline } from "@/domain/tariff/timeline";
import type { PriceableInterval } from "@/domain/tariff/types";
import { cellOf, dju } from "@/domain/weather";
import { addDays, localParts, zonedInstant } from "@/lib/time";
import { listCategories } from "../categories";
import type { HouseholdContext } from "../context";
import { listContracts } from "../contracts";
import { listFuelEvents } from "../fuel";
import { tempoColorsFor } from "../tempo/sync";

// Vue Chauffage (T26) : coût de la saison (postes chauffage au moteur, énergie seule, et
// combustibles au prix moyen pondéré), consommations comparées à la saison précédente sur
// la même durée, degrés-jours et température de la commune.

export interface HeatingMonth {
  key: string;
  electricCents: number;
  pelletCents: number;
  woodCents: number;
  /** null : pas de météo pour ce mois. */
  dju: number | null;
  tMean: number | null;
}

export interface SeasonFigures {
  cost: HeatingCost;
  /** Consommation en unité de base (kg, stère) et méthode de calcul. */
  fuels: Partial<Record<Fuel, { qty: number; method: "events" | "snapshots" | "none" }>>;
  electricKwh: number;
  dju: number | null;
  tMean: number | null;
}

export interface HeatingView {
  season: HeatingSeason;
  /** Fin effective [from, to) : aujourd'hui pour la saison en cours. */
  to: string;
  inProgress: boolean;
  nav: { prev: number | null; next: number | null };
  current: SeasonFigures;
  /** Saison précédente sur la même durée ; null sans aucune donnée. */
  previous: SeasonFigures | null;
  months: HeatingMonth[];
  /** Mois sans détail pour un combustible estimé par relevés. */
  snapshotFuels: Fuel[];
  noLocation: boolean;
  /** Poids d'un sac de granulés (Réglages), pour afficher les kg en sacs. */
  bagKg: number;
  modules: { pellet: boolean; wood: boolean; electric: boolean };
}

const shiftYear = (day: string, years: number) =>
  `${Number(day.slice(0, 4)) + years}${day.slice(4)}`.replace(/-02-29$/, "-02-28");

async function weatherDays(
  cell: { latE2: number; lonE2: number } | null,
  from: string,
  to: string,
) {
  if (!cell) return [];
  return db
    .select({ date: weatherDaily.date, tMean: weatherDaily.tMean })
    .from(weatherDaily)
    .where(
      and(
        eq(weatherDaily.latE2, cell.latE2),
        eq(weatherDaily.lonE2, cell.lonE2),
        gte(weatherDaily.date, from),
        lt(weatherDaily.date, to),
      ),
    )
    .orderBy(asc(weatherDaily.date));
}

export async function getHeating(
  ctx: HouseholdContext,
  rawStartYear: string | undefined,
  now = new Date(),
): Promise<HeatingView> {
  const tz = ctx.timezone;
  const today = localParts(now, tz).date;
  const bounds = ctx.settings.heatingSeason;
  const latest = heatingSeason(today, bounds);
  const requested = Number(rawStartYear);
  const season =
    Number.isInteger(requested) && requested >= 2000 && requested < latest.startYear
      ? seasonStarting(requested, bounds)
      : latest;
  const end = addDays(today, 1);
  const to = season.to < end ? season.to : end;
  const previousSeason = seasonStarting(season.startYear - 1, bounds);
  const previousTo = shiftYear(to, -1);

  const vis = visibleModules(ctx.profile);
  const modules = { pellet: vis.pellet, wood: vis.wood, electric: vis.heatingCategories };
  const fuels: Fuel[] = [
    ...(modules.pellet ? (["pellet"] as const) : []),
    ...(modules.wood ? (["wood"] as const) : []),
  ];

  const [events, categories, contracts, home] = await Promise.all([
    listFuelEvents(ctx),
    listCategories(ctx, now),
    listContracts(ctx),
    db
      .select({ location: household.location })
      .from(household)
      .where(eq(household.id, ctx.householdId)),
  ]);
  const location = home[0]?.location ?? null;
  const cell = location ? cellOf(location) : null;
  const heatingMetrics = modules.electric
    ? categories.filter((c) => c.isHeating).map((c) => `category:${c.slug}`)
    : [];

  const electricIntervals = async (from: string, until: string): Promise<PriceableInterval[]> => {
    if (heatingMetrics.length === 0) return [];
    const rows = await db
      .select({
        start: energyInterval.start,
        granularity: energyInterval.granularity,
        kwh: energyInterval.kwh,
      })
      .from(energyInterval)
      .where(
        and(
          eq(energyInterval.householdId, ctx.householdId),
          inArray(energyInterval.metric, heatingMetrics),
          gte(energyInterval.start, zonedInstant(from, 0, tz)),
          lt(energyInterval.start, zonedInstant(until, 0, tz)),
        ),
      );
    return rows.map((r) =>
      r.granularity === "hour"
        ? { granularity: "hour", start: r.start, kwh: r.kwh }
        : { granularity: "day", date: localParts(r.start, tz).date, slot: null, kwh: r.kwh },
    );
  };

  const colors = await tempoColorsFor(ctx.householdId, addDays(previousSeason.from, -1), to);
  const pricing = { timezone: tz, tempoColor: (d: string) => colors.get(d) };
  const avgPrice = Object.fromEntries(
    fuels.map((f) => [f, weightedAvgPrice(events, f, ctx.settings)]),
  ) as Record<Fuel, number | null>;

  const figures = async (from: string, until: string) => {
    const intervals = await electricIntervals(from, until);
    const priced =
      intervals.length > 0
        ? priceTimeline(intervals, buildTimeline(contracts, from, until, today), pricing)
        : null;
    const electricKwh = intervals.reduce((a, i) => a + i.kwh, 0);
    const window = { from: zonedInstant(from, 0, tz), to: zonedInstant(until, 0, tz) };
    const fuelUse = Object.fromEntries(
      fuels.map((f) => [f, seasonConsumption(events, f, window, ctx.settings)]),
    ) as SeasonFigures["fuels"];
    const weather = await weatherDays(cell, from, until);
    const djuTotal =
      weather.length > 0 ? seasonDju(weather, { ...season, from, to: until }).dju : null;
    const temps = weather.flatMap((w) => (w.tMean === null ? [] : [w.tMean]));
    const data: SeasonFigures = {
      cost: heatingCost({
        electric: modules.electric
          ? { kwh: electricKwh, energyCents: priced?.energyCents ?? 0 }
          : null,
        fuels: fuels.map((f) => ({
          fuel: f,
          qty: fuelUse[f]?.qty ?? 0,
          avgPricePerUnit: avgPrice[f],
        })),
        factors: ctx.settings.kwhFactors,
      }),
      fuels: fuelUse,
      electricKwh,
      dju: djuTotal,
      tMean: temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
    };
    return { data, byMonth: priced?.byMonth ?? {}, weather };
  };

  const current = await figures(season.from, to);
  const previous = await figures(previousSeason.from, previousTo);
  const previousHasData =
    previous.data.electricKwh > 0 ||
    Object.values(previous.data.fuels).some((f) => f && f.method !== "none");

  // Détail mensuel : consommations saisies (un combustible estimé par relevés n'a pas de
  // détail mensuel), électricité du moteur, météo de la commune.
  const monthOf = (d: Date) => localParts(d, tz).date.slice(0, 7);
  const months: HeatingMonth[] = [];
  for (let m = season.from.slice(0, 7); `${m}-01` < to;) {
    months.push({
      key: m,
      electricCents: current.byMonth[m]?.energyCents ?? 0,
      pelletCents: 0,
      woodCents: 0,
      dju: null,
      tMean: null,
    });
    const [y = 0, mm = 1] = m.split("-").map(Number);
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
  }
  const byKey = new Map(months.map((m) => [m.key, m]));
  const seasonStart = zonedInstant(season.from, 0, tz);
  const seasonEnd = zonedInstant(to, 0, tz);
  for (const e of events) {
    if (e.type !== "consumption" || e.at < seasonStart || e.at >= seasonEnd) continue;
    if (!fuels.includes(e.fuel) || current.data.fuels[e.fuel]?.method !== "events") continue;
    const month = byKey.get(monthOf(e.at));
    if (!month) continue;
    const cents = toBaseQty(e, ctx.settings) * (avgPrice[e.fuel] ?? 0) * 100;
    if (e.fuel === "pellet") month.pelletCents += cents;
    else month.woodCents += cents;
  }
  for (const m of months) {
    const days = current.weather.filter((w) => w.date.startsWith(m.key) && w.tMean !== null);
    if (days.length === 0) continue;
    m.dju = days.reduce((a, w) => a + (dju(w.tMean) ?? 0), 0);
    m.tMean = days.reduce((a, w) => a + (w.tMean ?? 0), 0) / days.length;
  }
  for (const m of months) {
    m.pelletCents = Math.round(m.pelletCents);
    m.woodCents = Math.round(m.woodCents);
  }

  return {
    season,
    to,
    inProgress: to < season.to,
    nav: {
      prev: previousHasData ? season.startYear - 1 : null,
      next: season.startYear < latest.startYear ? season.startYear + 1 : null,
    },
    current: current.data,
    previous: previousHasData ? previous.data : null,
    months,
    snapshotFuels: fuels.filter((f) => current.data.fuels[f]?.method === "snapshots"),
    noLocation: cell === null,
    bagKg: ctx.settings.pelletBagKg,
    modules,
  };
}
