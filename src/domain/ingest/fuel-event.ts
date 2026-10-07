import { z } from "zod";

// Décompte d'un combustible depuis Home Assistant (SPEC §6.5) : un bouton, une carte du
// tableau de bord ou une automatisation HA signale « un sac versé » (ou un demi-stère).
// Bloc `fuel_event` du contrat v1, additionnel : un envoi ordinaire est inchangé. Pur.

/** Quantité d'un décompte sans précision : un sac de granulés, un demi-stère de bois. */
const DEFAULT = { pellet: { qty: 1, unit: "bag" }, wood: { qty: 0.5, unit: "stere" } } as const;

const schema = z.object({
  version: z.literal(1),
  fuel_event: z.object({
    fuel: z.enum(["pellet", "wood"], "combustible attendu : pellet ou wood"),
    /** Sacs (granulés) ou stères (bois) ; 50 au plus par décompte. */
    qty: z.number().positive("quantité positive attendue").max(50, "50 au plus").optional(),
  }),
});

export interface FuelEventInput {
  fuel: "pellet" | "wood";
  qty: number;
  unit: "bag" | "stere";
}

export const isFuelEvent = (json: unknown): boolean =>
  typeof json === "object" && json !== null && "fuel_event" in json;

export function parseFuelEvent(json: unknown) {
  const r = schema.safeParse(json);
  if (!r.success) {
    return {
      success: false as const,
      errors: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  const { fuel, qty } = r.data.fuel_event;
  const data: FuelEventInput = { fuel, qty: qty ?? DEFAULT[fuel].qty, unit: DEFAULT[fuel].unit };
  return { success: true as const, data };
}
