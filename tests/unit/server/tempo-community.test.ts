import { describe, expect, it } from "vitest";
import { CommunityTempoSource } from "@/server/tempo/community";
import season from "../../fixtures/tempo/season-2026-2027.json";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("CommunityTempoSource", () => {
  it("demande la saison à api-couleur-tempo.fr", async () => {
    const calls: string[] = [];
    const source = new CommunityTempoSource({
      fetchFn: async (url) => {
        calls.push(url);
        return json(season);
      },
      sleep: async () => {},
    });
    const days = await source.season("2026-2027");
    expect(days.length).toBeGreaterThan(0);
    expect(calls).toEqual(["https://www.api-couleur-tempo.fr/api/joursTempo?periode=2026-2027"]);
  });

  it("réessaie sur 5xx puis abandonne", async () => {
    let n = 0;
    const source = new CommunityTempoSource({
      fetchFn: async () => {
        n += 1;
        return json({}, 502);
      },
      sleep: async () => {},
    });
    await expect(source.season("2026-2027")).rejects.toThrow("HTTP 502");
    expect(n).toBe(3);
  });

  it("refuse une saison mal formée sans appel réseau", async () => {
    const source = new CommunityTempoSource({
      fetchFn: async () => {
        throw new Error("ne doit pas être appelé");
      },
    });
    await expect(source.season("2026")).rejects.toThrow("saison invalide");
  });
});
