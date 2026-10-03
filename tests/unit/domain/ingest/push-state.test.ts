import { describe, expect, it } from "vitest";
import { pushState } from "@/domain/ingest/push-state";

const H = 3_600_000;

describe("pushState", () => {
  it("jamais reçu, à jour, en retard selon la granularité", () => {
    expect(pushState(null, 10 * H, "hourly")).toBe("never");
    expect(pushState(8 * H, 10 * H, "hourly")).toBe("ok");
    expect(pushState(7 * H, 10 * H, "hourly")).toBe("stale");
    expect(pushState(0, 25 * H, "daily")).toBe("ok");
    expect(pushState(0, 27 * H, "daily")).toBe("stale");
  });
});
