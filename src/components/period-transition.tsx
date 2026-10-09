"use client";

import Link, { useLinkStatus } from "next/link";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigationWake } from "@/components/use-navigation-wake";

// Changement de période sur la même page (Vue d'ensemble `?p=`, Chauffage `?s=`) : Next.js
// n'affiche pas de squelette quand seule la requête change. Comme pour le menu, le lien
// touché devient actif aussitôt et pulse, et le contenu s'estompe jusqu'aux nouveaux
// chiffres. La navigation reste celle de next/link ; son état vient de useLinkStatus.

interface PeriodNav {
  /** Adresse en cours de chargement ; null sinon. */
  target: string | null;
  report: (href: string, pending: boolean) => void;
}

const Ctx = createContext<PeriodNav | null>(null);

export function PeriodTransition({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<string | null>(null);
  const report = useCallback(
    (href: string, pending: boolean) => setTarget((t) => (pending ? href : t === href ? null : t)),
    [],
  );
  return <Ctx.Provider value={{ target, report }}>{children}</Ctx.Provider>;
}

/** Contenu qui dépend de la période : estompé pendant le chargement d'une autre période. */
export function PeriodContent({ children }: { children: ReactNode }) {
  const loading = useContext(Ctx)?.target != null;
  return (
    <div
      aria-busy={loading}
      className={`flex flex-col gap-5 transition-opacity duration-150 ${
        loading ? "pointer-events-none opacity-50" : ""
      }`}
    >
      {children}
    </div>
  );
}

/** Dans un lien : signale au contexte que sa page charge (useLinkStatus). */
function PendingReporter({ href }: { href: string }) {
  const { pending } = useLinkStatus();
  useNavigationWake(pending);
  const report = useContext(Ctx)?.report;
  useEffect(() => {
    report?.(href, pending);
    // Lien démonté ou redirigé ailleurs (flèches ‹ › après la navigation) : l'adresse qu'il
    // chargeait n'est plus en cours.
    return () => {
      if (pending) report?.(href, false);
    };
  }, [report, href, pending]);
  return null;
}

/**
 * Lien vers une autre période. `selected` : état actuel ; pendant un chargement, c'est le
 * lien visé qui est montré actif (`activeClassName`, sinon `inactiveClassName`) et qui
 * pulse.
 */
export function PeriodLink({
  href,
  selected = false,
  className,
  activeClassName = "",
  inactiveClassName = "",
  children,
  ...rest
}: {
  href: string;
  selected?: boolean;
  className: string;
  activeClassName?: string;
  inactiveClassName?: string;
  children: ReactNode;
  role?: string;
  title?: string;
  "aria-label"?: string;
}) {
  const target = useContext(Ctx)?.target ?? null;
  const loading = target === href;
  const active = target ? loading : selected;
  return (
    <Link
      {...rest}
      href={href}
      scroll={false}
      // Pas de préchargement : une page en compte jusqu'à seize (onglets, flèches, barres
      // mensuelles), chacune recalculée côté serveur ; préchargées ensemble, elles saturaient
      // le serveur et retardaient le clic lui-même.
      prefetch={false}
      aria-current={active ? "true" : undefined}
      aria-selected={rest.role === "tab" ? active : undefined}
      className={`${className} ${active ? activeClassName : inactiveClassName} ${
        loading ? "animate-pulse" : ""
      }`}
    >
      {children}
      <PendingReporter href={href} />
    </Link>
  );
}
