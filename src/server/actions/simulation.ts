"use server";

import { z } from "zod";
import { getHouseholdContext } from "../context";
import { runSimulation, type SimulationView } from "../simulation";

const input = z.object({
  battery: z
    .object({
      capacityKwh: z.number().min(1).max(50),
      powerKw: z.number().min(0.5).max(25),
      costEur: z.number().min(0).max(100_000),
    })
    .nullable(),
  panels: z
    .object({ kwc: z.number().min(0.5).max(30), costEur: z.number().min(0).max(100_000) })
    .nullable(),
});

export type SimulationActionResult =
  { ok: true; view: SimulationView } | { ok: false; error: string };

/** Simule une batterie et/ou des panneaux en plus sur les 12 derniers mois du foyer. */
export async function simulateAction(raw: unknown): Promise<SimulationActionResult> {
  const p = input.safeParse(raw);
  if (!p.success || (!p.data.battery && !p.data.panels)) {
    return {
      ok: false,
      error: "Valeurs hors limites : vérifiez la capacité, la puissance et le prix.",
    };
  }
  const ctx = await getHouseholdContext();
  return { ok: true, view: await runSimulation(ctx, p.data) };
}
