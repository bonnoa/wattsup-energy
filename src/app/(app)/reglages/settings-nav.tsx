"use client";

import Link, { useLinkStatus } from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/ui";
import {
  parseSettingsTab,
  SETTINGS_GROUPS,
  SETTINGS_TABS,
  settingsHref,
  type SettingsTab,
} from "@/lib/settings-tabs";

// Navigation de Réglages. Ordinateur : menu vertical regroupé, collé en haut pendant le
// défilement. Téléphone : liste des sections (icône, nom, une ligne d'explication) quand
// aucune n'est choisie, sinon un lien « ‹ Réglages » au-dessus de la section.
// La section cliquée passe active aussitôt, avec un indicateur tant que la page charge.

const sections = (tabs: readonly SettingsTab[]) =>
  SETTINGS_GROUPS.map((g) => ({
    ...g,
    items: SETTINGS_TABS.filter((t) => t.group === g.id && tabs.includes(t.id)),
  })).filter((g) => g.items.length > 0);

/** Petit cercle qui tourne pendant le chargement du lien cliqué (rien sinon). */
function Pending() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span
      aria-hidden
      className="ml-auto size-3.5 flex-none animate-spin rounded-full border-2 border-current border-r-transparent opacity-60"
    />
  ) : null;
}

/** Section active, y compris celle qu'on vient de cliquer avant que la page n'arrive. */
function useActive(active: SettingsTab | null) {
  const [clicked, setClicked] = useState<SettingsTab | null>(null);
  useEffect(() => setClicked(null), [active]);
  return [clicked ?? active, setClicked] as const;
}

export function SettingsSidebar({
  tabs,
  active,
}: {
  tabs: readonly SettingsTab[];
  active: SettingsTab;
}) {
  const [current, setClicked] = useActive(active);
  return (
    <nav aria-label="Sections des réglages" className="sticky top-8 flex flex-col gap-5">
      {sections(tabs).map((g) => (
        <div key={g.id} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">
            {g.label}
          </p>
          {g.items.map((t) => {
            const on = t.id === current;
            return (
              <Link
                key={t.id}
                href={settingsHref(t.id)}
                scroll={false}
                aria-current={on ? "page" : undefined}
                onClick={() => setClicked(t.id)}
                className={`flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[14px] font-medium no-underline ${
                  on
                    ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                    : "text-ink-soft hover:bg-surface/60 hover:text-ink"
                }`}
              >
                <Icon name={t.icon} size={16} />
                {t.label}
                <Pending />
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Téléphone : toutes les sections, regroupées, une ligne chacune. */
export function SettingsIndex({ tabs }: { tabs: readonly SettingsTab[] }) {
  return (
    <nav aria-label="Sections des réglages" className="flex flex-col gap-5">
      {sections(tabs).map((g) => (
        <section key={g.id} className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-medium tracking-wide text-muted uppercase">{g.label}</h2>
          <ul className="overflow-hidden rounded-card border border-border bg-surface">
            {g.items.map((t) => (
              <li key={t.id} className="border-t border-track first:border-t-0">
                <Link
                  href={settingsHref(t.id)}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 text-ink no-underline active:bg-bg"
                >
                  <span className="flex size-9 flex-none items-center justify-center rounded-control bg-bg text-subtle">
                    <Icon name={t.icon} size={17} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-medium">{t.label}</span>
                    <span className="text-xs text-muted text-pretty">{t.description}</span>
                  </span>
                  <Pending />
                  <span className="flex-none text-subtle">
                    <Icon name="chevron" size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

/** En-tête d'une section : retour à la liste (téléphone), nom et explication. */
export function SectionHeader({ tab }: { tab: SettingsTab }) {
  const t = SETTINGS_TABS.find((x) => x.id === tab);
  return (
    <div className="flex flex-col gap-1">
      <Link
        href="/reglages"
        className="flex w-fit items-center gap-1 pb-1 text-[13px] font-medium text-ink-soft no-underline lg:hidden"
      >
        <span className="rotate-180">
          <Icon name="chevron" size={14} />
        </span>
        Réglages
        <Pending />
      </Link>
      {/* Un seul titre visible à la fois : titre de page sur téléphone, de section sur ordinateur. */}
      <h1 className="text-[26px] leading-[1.1] font-semibold tracking-[-0.02em] lg:hidden">
        {t?.label}
      </h1>
      <h2 className="hidden text-lg font-semibold tracking-tight lg:block">{t?.label}</h2>
      <p className="text-xs text-muted text-pretty">{t?.description}</p>
    </div>
  );
}

/**
 * Cadre de Réglages (mise en page) : titre, menu et en-tête de section restent en place
 * pendant qu'une section charge ; seul le contenu passe par le squelette (loading.tsx).
 * Sans section demandée : la liste des sections sur téléphone, le Profil sur ordinateur.
 */
export function SettingsFrame({
  tabs,
  children,
}: {
  tabs: readonly SettingsTab[];
  children: ReactNode;
}) {
  const onglet = useSearchParams().get("onglet");
  const chosen = onglet !== null;
  // Téléphone : la liste et chaque section sont des écrans à part, on repart du haut. (Sur
  // ordinateur, le menu reste à sa place : pas de saut.)
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) window.scrollTo(0, 0);
  }, [onglet]);
  const tab = parseSettingsTab(onglet, tabs);
  return (
    <>
      {/* Téléphone, dans une section : le titre est celui de la section, sous « ‹ Réglages ». */}
      <div className={chosen ? "hidden lg:block" : ""}>
        <PageHeader title="Réglages" subtitle="Votre foyer et la liaison avec Home Assistant" />
      </div>
      <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div className="hidden lg:block">
          <SettingsSidebar tabs={tabs} active={tab} />
        </div>
        {!chosen && (
          <div className="lg:hidden">
            <SettingsIndex tabs={tabs} />
          </div>
        )}
        <div className={`${chosen ? "flex" : "hidden lg:flex"} min-w-0 flex-col gap-4`}>
          <SectionHeader tab={tab} />
          {children}
        </div>
      </div>
    </>
  );
}
