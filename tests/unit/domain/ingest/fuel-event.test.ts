import { describe, expect, it } from "vitest";
import { isFuelEvent, parseFuelEvent } from "@/domain/ingest/fuel-event";

describe("fuel_event (décompte depuis Home Assistant)", () => {
  it("reconnaît le bloc ; quantité par défaut selon le combustible", () => {
    expect(isFuelEvent({ version: 1, fuel_event: { fuel: "pellet" } })).toBe(true);
    expect(isFuelEvent({ version: 1, ts: "2026-10-07T10:00:00Z" })).toBe(false);
    expect(parseFuelEvent({ version: 1, fuel_event: { fuel: "pellet" } })).toEqual({
      success: true,
      data: { fuel: "pellet", qty: 1, unit: "bag" },
    });
    expect(parseFuelEvent({ version: 1, fuel_event: { fuel: "wood" } })).toEqual({
      success: true,
      data: { fuel: "wood", qty: 0.5, unit: "stere" },
    });
    expect(parseFuelEvent({ version: 1, fuel_event: { fuel: "pellet", qty: 2 } })).toMatchObject({
      data: { qty: 2 },
    });
  });

  it("refuse un combustible inconnu ou une quantité hors bornes", () => {
    expect(parseFuelEvent({ version: 1, fuel_event: { fuel: "fioul" } }).success).toBe(false);
    expect(parseFuelEvent({ version: 1, fuel_event: { fuel: "pellet", qty: 0 } }).success).toBe(
      false,
    );
    expect(parseFuelEvent({ version: 1, fuel_event: { fuel: "pellet", qty: 51 } }).success).toBe(
      false,
    );
  });
});
