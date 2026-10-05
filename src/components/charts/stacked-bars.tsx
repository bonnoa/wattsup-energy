import Link from "next/link";

// Barres verticales empilées en HTML (SPEC §2 : graphiques maison). Segments séparés de
// 2 px, extrémité arrondie, info-bulle native par barre. Une barre peut être un lien
// (sélection d'un mois). Une courbe peut se superposer aux barres, sur sa propre échelle.

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
  /** Du bas vers le haut de la barre. */
  segments: BarSegment[];
  /** Texte de l'info-bulle. */
  title: string;
  href?: string;
  selected?: boolean;
}

/** Courbe superposée : une valeur par barre (null : pas de point, la courbe s'interrompt). */
export interface BarLine {
  values: (number | null)[];
  /** Couleur du trait (CSS). */
  color: string;
}

/** Tracés de la courbe en coordonnées 0–100, un par suite de valeurs connues. */
function linePaths(values: (number | null)[]): string[] {
  const max = Math.max(...values.map((v) => v ?? 0), 0);
  if (max <= 0) return [];
  const paths: string[] = [];
  let current: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length > 1) paths.push(current.join(" "));
      current = [];
      return;
    }
    // Sommet à 90 % de la hauteur : la courbe ne colle pas au bord.
    current.push(`${((i + 0.5) / values.length) * 100},${100 - (v / max) * 90}`);
  });
  if (current.length > 1) paths.push(current.join(" "));
  return paths;
}

export function StackedBars({
  bars,
  height = 160,
  ariaLabel,
  line,
}: {
  bars: Bar[];
  height?: number;
  ariaLabel: string;
  line?: BarLine;
}) {
  const max = Math.max(...bars.map((b) => b.segments.reduce((a, s) => a + s.value, 0)), 0);
  const anySelected = bars.some((b) => b.selected);
  return (
    <div className="flex flex-col gap-1.5" role="img" aria-label={ariaLabel}>
      {/* Colonnes de largeur égale (marge de 1,5 px de chaque côté plutôt qu'un gap) : le
          centre de chaque barre est exactement là où la courbe place son point. */}
      <div className="relative flex items-end border-b border-border" style={{ height }}>
        {bars.map((b) => {
          const total = b.segments.reduce((a, s) => a + s.value, 0);
          const visible = b.segments.filter((s) => s.value > 0);
          const body = (
            <div
              className="flex h-full flex-col-reverse gap-[2px]"
              style={{ opacity: anySelected && !b.selected ? 0.45 : 1 }}
            >
              {visible.map((s, i) => (
                <div
                  key={s.label}
                  className={`${s.color} ${i === visible.length - 1 ? "rounded-t-[4px]" : ""}`}
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
              className="h-full min-w-0 flex-1 rounded-t-[4px] px-[1.5px] hover:opacity-100 focus-visible:outline-2 focus-visible:outline-ink"
            >
              {body}
            </Link>
          ) : (
            <div key={b.key} title={b.title} className="h-full min-w-0 flex-1 px-[1.5px]">
              {body}
            </div>
          );
        })}
        {line && (
          <svg
            aria-hidden
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
          >
            {linePaths(line.values).map((points) => (
              <g key={points}>
                {/* Liseré couleur de fond : la courbe se détache des barres. */}
                <polyline
                  points={points}
                  fill="none"
                  stroke="var(--color-surface)"
                  strokeWidth={4}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                <polyline
                  points={points}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
          </svg>
        )}
      </div>
      <div className="flex" aria-hidden>
        {bars.map((b) => (
          <span
            key={b.key}
            className={`min-w-0 flex-1 truncate px-[1.5px] text-center text-[10px] tabular-nums ${
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
