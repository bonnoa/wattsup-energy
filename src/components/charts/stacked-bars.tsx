import Link from "next/link";

// Barres verticales empilées en HTML (SPEC §2 : graphiques maison). Une seule échelle,
// segments séparés de 2 px, extrémité arrondie, info-bulle native par barre. Une barre
// peut être un lien (sélection d'un mois).

export interface BarSegment {
  value: number;
  /** Classe de fond Tailwind (ex. `bg-grid`). */
  color: string;
  label: string;
}

export interface Bar {
  key: string;
  /** Libellé sous la barre (court). */
  label: string;
  segments: BarSegment[];
  /** Texte de l'info-bulle. */
  title: string;
  href?: string;
  selected?: boolean;
}

export function StackedBars({
  bars,
  height = 160,
  ariaLabel,
}: {
  bars: Bar[];
  height?: number;
  ariaLabel: string;
}) {
  const max = Math.max(...bars.map((b) => b.segments.reduce((a, s) => a + s.value, 0)), 0);
  const anySelected = bars.some((b) => b.selected);
  return (
    <div className="flex flex-col gap-1.5" role="img" aria-label={ariaLabel}>
      <div className="flex items-end gap-[3px] border-b border-border" style={{ height }}>
        {bars.map((b) => {
          const total = b.segments.reduce((a, s) => a + s.value, 0);
          const body = (
            <div
              className="flex h-full flex-col justify-end gap-[2px]"
              style={{ opacity: anySelected && !b.selected ? 0.45 : 1 }}
            >
              {b.segments
                .filter((s) => s.value > 0)
                .map((s, i) => (
                  <div
                    key={s.label}
                    className={`${s.color} ${i === 0 ? "rounded-t-[4px]" : ""}`}
                    style={{ height: max > 0 ? `${(s.value / max) * 100}%` : 0 }}
                  />
                ))}
              {total === 0 && <div className="h-px" />}
            </div>
          );
          return b.href ? (
            <Link
              key={b.key}
              href={b.href}
              title={b.title}
              aria-label={b.title}
              aria-current={b.selected ? "true" : undefined}
              scroll={false}
              className="h-full min-w-0 flex-1 rounded-t-[4px] hover:opacity-100 focus-visible:outline-2 focus-visible:outline-ink"
            >
              {body}
            </Link>
          ) : (
            <div key={b.key} title={b.title} className="h-full min-w-0 flex-1">
              {body}
            </div>
          );
        })}
      </div>
      <div className="flex gap-[3px]" aria-hidden>
        {bars.map((b) => (
          <span
            key={b.key}
            className={`min-w-0 flex-1 truncate text-center text-[10px] tabular-nums ${
              b.selected ? "font-semibold text-ink" : "text-subtle"
            }`}
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
