// Sous-onglets de Réglages : un ou deux encarts liés par onglet. Les liens des autres
// écrans visent directement l'onglet utile.

export const SETTINGS_TABS = [
  {
    id: "profil",
    label: "Profil",
    description: "Les équipements de votre foyer : l'interface masque le reste.",
  },
  { id: "localisation", label: "Localisation", description: "Votre commune, pour la météo." },
  {
    id: "equipements",
    label: "Équipements",
    description: "Revente, charge de la batterie, sacs, palettes et saison de chauffe.",
  },
  {
    id: "home-assistant",
    label: "Home Assistant",
    description: "Token, granularité des envois et derniers envois reçus.",
  },
  { id: "postes", label: "Postes", description: "Les appareils ou circuits suivis séparément." },
  {
    id: "donnees",
    label: "Données",
    description: "Contrôler et corriger les valeurs enregistrées.",
  },
  {
    id: "historique",
    label: "Historique",
    description: "Votre historique, depuis Home Assistant ou un fichier CSV.",
  },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

/** Onglet demandé ; à défaut, ou s'il est masqué par le profil, le premier. */
export function parseSettingsTab(raw: unknown, visible: readonly SettingsTab[]): SettingsTab {
  const tab = SETTINGS_TABS.find((t) => t.id === raw)?.id;
  return tab && visible.includes(tab) ? tab : "profil";
}

export const settingsHref = (tab: SettingsTab) => `/reglages?onglet=${tab}`;
