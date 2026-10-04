// Jauge circulaire (part amortie) : un anneau de fond, un arc de progression à bout arrondi,
// la valeur au centre. Une seule mesure : pas de légende.

export function RingGauge({
  ratio,
  label,
  color = "stroke-battery",
  size = 96,
}: {
  /** 0–1. */
  ratio: number;
  /** Texte au centre (ex. « 42 % »). */
  label: string;
  /** Classe de trait Tailwind de l'arc. */
  color?: string;
  size?: number;
}) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, ratio));
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Amorti à ${label}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-track"
        />
        {clamped > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${clamped * circumference} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className={color}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[17px] font-semibold tabular-nums">
        {label}
      </span>
    </div>
  );
}
