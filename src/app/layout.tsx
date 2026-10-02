import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
    <html lang="fr">
      <body className={`${instrumentSans.variable} ${jetbrainsMono.variable}`}>{children}</body>
    </html>
  );
}
