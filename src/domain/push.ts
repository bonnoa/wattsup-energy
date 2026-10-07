import type { Alert } from "./alerts";

// Notifications push (SPEC §9, T49) : nom lisible d'un appareil et contenu d'une
// notification d'alertes. Pur.

/** « Chrome sur Android », « Safari sur iPhone »… d'après l'en-tête User-Agent. */
export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\/|FxiOS/.test(ua)
      ? "Firefox"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  if (browser && os) return `${browser} sur ${os}`;
  return browser ?? os ?? "Appareil inconnu";
}

export interface PushPayload {
  title: string;
  body: string;
  /** Page ouverte au clic (chemin de l'appli). */
  url: string;
  /** Même tag : une nouvelle notification remplace la précédente au lieu de s'empiler. */
  tag: string;
}

/** Une notification pour les alertes nouvelles ou aggravées d'un passage. */
export function alertsPush(alerts: readonly Alert[]): PushPayload | null {
  const [first] = alerts;
  if (!first) return null;
  if (alerts.length === 1) {
    return { title: first.title, body: first.text, url: first.href, tag: "wattsup-alertes" };
  }
  return {
    title: `${alerts.length} alertes WattsUp`,
    body: alerts.map((a) => a.title).join(" · "),
    url: "/",
    tag: "wattsup-alertes",
  };
}
