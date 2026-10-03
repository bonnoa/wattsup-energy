import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Polices auto-hébergées (variables, sous-ensemble latin, licence OFL dans src/fonts) :
// aucun appel à Google Fonts, ni au build ni chez les visiteurs.
const instrumentSans = localFont({
  src: "../fonts/InstrumentSans-Variable-latin.woff2",
  variable: "--font-instrument-sans",
  weight: "400 700",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "../fonts/JetBrainsMono-Variable-latin.woff2",
  variable: "--font-jetbrains-mono",
  weight: "400 600",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WattsUp Energy",
  description: "Analyse et optimisation de l'énergie du foyer, alimentée par Home Assistant.",
  icons: { icon: "/wattsup.svg" },
};

export const viewport: Viewport = {
  themeColor: "#16181A",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Variables de police sur <html> : --font-sans (défini sur :root) doit pouvoir les lire.
    <html lang="fr" className={`${instrumentSans.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
