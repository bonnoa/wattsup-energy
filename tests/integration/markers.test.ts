import { describe, expect, it } from "vitest";
import type { HouseholdContext } from "@/server/context";
import {
  createMarker,
  deleteMarker,
  listMarkers,
  MarkerError,
  updateMarker,
} from "@/server/markers";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const pac = {
  kind: "equipment" as const,
  text: "  Pompe à chaleur installée ",
  startDate: "2026-03-12",
  endDate: null,
};

describe("repères", () => {
  it("créer, lister par période (durées à cheval comprises), modifier, supprimer", async () => {
    const ctx = await createTestHousehold();
    const created = await createMarker(ctx, pac);
    expect(created).toMatchObject({ text: "Pompe à chaleur installée", endDate: null });
    await createMarker(ctx, {
      kind: "absence",
      text: "Vacances",
      startDate: "2026-07-28",
      endDate: "2026-08-15",
    });

    expect((await listMarkers(ctx, "2026-08-01", "2026-09-01")).map((m) => m.text)).toEqual([
      "Vacances",
    ]);
    expect(await listMarkers(ctx, "2026-04-01", "2026-07-01")).toEqual([]);
    expect(await listMarkers(ctx, "2026-01-01", "2027-01-01")).toHaveLength(2);

    const updated = await updateMarker(ctx, created?.id ?? "", {
      ...pac,
      text: "PAC",
      endDate: "2026-03-12", // fin = début : un seul jour
    });
    expect(updated).toMatchObject({ text: "PAC", endDate: null });
    expect(await deleteMarker(ctx, created?.id ?? "")).toBe(true);
    expect(await listMarkers(ctx, "2026-03-01", "2026-04-01")).toEqual([]);
  });

  it("refuse un texte vide et une fin avant le début", async () => {
    const ctx = await createTestHousehold();
    await expect(createMarker(ctx, { ...pac, text: "   " })).rejects.toThrow(MarkerError);
    await expect(createMarker(ctx, { ...pac, endDate: "2026-03-01" })).rejects.toThrow(MarkerError);
  });
});

const ownedByB = async (b: HouseholdContext) => (await createMarker(b, pac))?.id ?? "";
const untouched = async (b: HouseholdContext) => {
  expect(await listMarkers(b, "2026-01-01", "2027-01-01")).toHaveLength(1);
};

describeTenantIsolation("liste des repères", {
  setup: ownedByB,
  attempt: (a) => listMarkers(a, "2026-01-01", "2027-01-01"),
  expect: "empty",
});
describeTenantIsolation("modification d'un repère", {
  setup: ownedByB,
  attempt: (a, id) => updateMarker(a, id, { ...pac, text: "piraté" }),
  expect: "empty",
  untouched,
});
describeTenantIsolation("suppression d'un repère", {
  setup: ownedByB,
  attempt: async (a, id) => ((await deleteMarker(a, id)) ? ["supprimé"] : []),
  expect: "empty",
  untouched,
});
