import { describe, expect, it } from "vitest";
import type { Alert } from "@/domain/alerts";
import { alertsPush, deviceLabel } from "@/domain/push";

describe("deviceLabel", () => {
  it("navigateur et système", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
      ),
    ).toBe("Chrome sur Android");
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari sur iPhone");
    expect(
      deviceLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
      ),
    ).toBe("Firefox sur Windows");
    expect(deviceLabel(null)).toBe("Appareil inconnu");
  });
});

const alert = (key: string, title: string): Alert => ({
  key,
  kind: "budget",
  level: 1,
  title,
  text: `${title} : détail`,
  href: "/?p=2026-10",
  action: "Voir",
  nav: "overview",
});

describe("alertsPush", () => {
  it("une alerte : son titre, son texte et sa page ; plusieurs : leur nombre", () => {
    expect(alertsPush([alert("a", "Dépense en hausse")])).toEqual({
      title: "Dépense en hausse",
      body: "Dépense en hausse : détail",
      url: "/?p=2026-10",
      tag: "wattsup-alertes",
    });
    expect(alertsPush([alert("a", "A"), alert("b", "B")])).toMatchObject({
      title: "2 alertes WattsUp",
      body: "A · B",
      url: "/",
    });
    expect(alertsPush([])).toBeNull();
  });
});
