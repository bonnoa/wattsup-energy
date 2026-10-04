"use client";

import { useEffect, useRef } from "react";

/** Barre d'onglets défilante : l'onglet actif est ramené à l'écran (mobile). */
export function ScrollToActive({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [children]);
  return (
    <div ref={ref} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      {children}
    </div>
  );
}
