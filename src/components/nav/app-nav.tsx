"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/domain/profile";
import { HaStatus } from "./ha-status";
import { NavIcon } from "./icons";
import { SignOutButton } from "./sign-out-button";

interface Props {
  items: NavItem[];
  userName: string;
  householdName: string;
  ingest: { lastPushAt: string | null; granularity: "hourly" | "daily"; renderedAt: string };
}

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

export function AppNav({ items, userName, householdName, ingest }: Props) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop : barre latérale sombre (≥ 1024 px) */}
      <aside className="sticky top-0 hidden h-dvh w-[232px] flex-none flex-col bg-ink px-4 py-6 text-bg lg:flex">
        <div className="flex items-center gap-2.5 px-2 pb-7">
          <Image src="/wattsup.svg" alt="" width={30} height={30} priority />
          <span className="text-[17px] font-bold tracking-tight">
            WattsUp<span className="text-solar"> Energy</span>
          </span>
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Navigation principale">
          {items.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.id}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-sm font-medium no-underline hover:bg-bg/[0.08] ${
                  active ? "bg-bg/[0.12] text-bg" : "text-[#A9ADA6]"
                }`}
              >
                <NavIcon id={n.id} size={18} />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <HaStatus {...ingest} />
        </div>
        <div className="flex items-center gap-2.5 px-2 pt-4">
          <div className="flex size-8 items-center justify-center rounded-full bg-grid text-[13px] font-semibold">
            {userName.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-semibold">{userName}</span>
            <span className="truncate text-xs text-[#7D817A]">{householdName}</span>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile : en-tête */}
      <header className="flex items-center justify-between bg-bg px-4 pt-4 pb-3 lg:hidden">
        <div className="flex items-center gap-2">
          <Image src="/wattsup.svg" alt="" width={28} height={28} priority />
          <span className="text-base font-bold">WattsUp</span>
        </div>
        <HaStatus {...ingest} compact />
      </header>

      {/* Mobile : barre d'onglets */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface px-1.5 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))] lg:hidden"
      >
        {items.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <Link
              key={n.id}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 no-underline ${
                active ? "text-ink" : "text-subtle"
              }`}
            >
              <NavIcon id={n.id} size={22} />
              <span className={`text-[11px] ${active ? "font-semibold" : "font-medium"}`}>
                {n.short}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
