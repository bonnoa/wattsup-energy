// Pictogrammes d'interface (trait 1,7 px, même style que la navigation).
const PATHS = {
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5 10 17l9-10",
  key: "M14.5 9.5a4 4 0 1 0-1.4 3.1L21 20.5M17 16.5l2-2M15 14.5l1.5-1.5",
  pin: "M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  sliders: "M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
