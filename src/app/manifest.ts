import type { MetadataRoute } from "next";

// Manifeste de l'appli installable (écran d'accueil du téléphone, fenêtre d'appli sur
// ordinateur). Pas de mode hors ligne : les données viennent du serveur.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WattsUp Energy",
    short_name: "WattsUp",
    description: "Analyse et optimisation de l'énergie du foyer, alimentée par Home Assistant.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F4F2EC",
    theme_color: "#F4F2EC",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
