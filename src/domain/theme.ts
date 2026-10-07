// Thème de l'interface (SPEC §9, Mon compte) : clair par défaut, sombre, ou celui de
// l'appareil (« auto », résolu en CSS par prefers-color-scheme). Pur.

export const THEMES = ["light", "dark", "auto"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  light: "Clair",
  dark: "Sombre",
  auto: "Automatique",
};

/** Valeur lue en base ou reçue du client ; tout le reste retombe sur le thème clair. */
export const parseTheme = (raw: unknown): Theme => THEMES.find((t) => t === raw) ?? "light";
