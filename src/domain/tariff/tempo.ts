import { tempoDay } from "@/lib/time";
import { coveredFraction, toSegments } from "./base-hphc";
import type { Pricer, Share } from "./pricer";
import type { PricingContext, Slot, TempoColor, TempoContract } from "./types";

// Tempo (SPEC §7.1) : la journée Tempo va de 6 h à 6 h, donc une heure entre 0 h et
// 6 h prend la couleur de la veille. Heures creuses fixes de 22 h à 6 h. Une couleur
// inconnue est facturée en bleu (le cas le plus fréquent) et comptée comme supposée.

const TEMPO_HC = toSegments([{ from: "22:00", to: "06:00" }]);
const HC_SHARE_OF_DAY = coveredFraction(TEMPO_HC, 0, 1440);

export function tempoPricer(contract: TempoContract, ctx: PricingContext): Pricer {
  const assumed = new Set<string>();

  const colorOf = (day: string): TempoColor => {
    const color = ctx.tempoColor?.(day);
    if (color) return color;
    assumed.add(day);
    return "bleu";
  };

  const share = (color: TempoColor, slot: Slot, fraction: number): Share => ({
    key: `${color}_${slot}`,
    price: contract.prices[color][slot],
    fraction,
  });

  const split = (color: TempoColor, hc: number): Share[] =>
    [share(color, "hc", hc), share(color, "hp", 1 - hc)].filter((s) => s.fraction > 0);

  return {
    hour: (local, start) => {
      const color = colorOf(tempoDay(start, ctx.timezone));
      return split(color, coveredFraction(TEMPO_HC, local.hour * 60 + local.minute, 60));
    },
    // Totaux journaliers : la couleur du jour calendaire s'applique à tout le jour
    // (les heures de 0 h à 6 h sont rattachées au même jour, faute de détail horaire).
    day: (date, slot) => {
      const color = colorOf(date);
      return slot
        ? { shares: [share(color, slot, 1)], approximated: false }
        : { shares: split(color, HC_SHARE_OF_DAY), approximated: true };
    },
    assumedDays: () => assumed.size,
  };
}
