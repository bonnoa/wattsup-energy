import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  type CategoryColor,
  type CategoryIcon,
} from "@/domain/categories";
import { Icon } from "./icon";

// Apparence d'un poste de consommation (pictogramme et couleur), partagée par Réglages et
// la Vue d'ensemble. Classes écrites en entier pour que Tailwind les génère.

export const CATEGORY_SWATCH: Record<CategoryColor, { bg: string; tile: string; label: string }> = {
  grid: { bg: "bg-grid", tile: "bg-grid/12 text-grid", label: "Bleu" },
  solar: { bg: "bg-solar", tile: "bg-solar/15 text-solar-ink", label: "Jaune" },
  battery: { bg: "bg-battery", tile: "bg-battery/15 text-positive", label: "Vert" },
  pellet: { bg: "bg-pellet", tile: "bg-pellet/15 text-pellet", label: "Orange" },
  wood: { bg: "bg-wood", tile: "bg-wood/15 text-wood", label: "Brun" },
  eheat: { bg: "bg-eheat", tile: "bg-eheat/12 text-eheat", label: "Rouge" },
};

/** Couleur enregistrée, ou bleu si elle est absente ou inconnue. */
export const categoryColor = (c: string | null): CategoryColor =>
  (CATEGORY_COLORS as readonly string[]).includes(c ?? "") ? (c as CategoryColor) : "grid";

/** Pictogramme enregistré, ou prise s'il est absent ou inconnu. */
export const categoryIcon = (i: string | null): CategoryIcon =>
  (CATEGORY_ICONS as readonly string[]).includes(i ?? "") ? (i as CategoryIcon) : "plug";

/** Pastille carrée du poste : pictogramme sur fond teinté. */
export function CategoryTile({
  icon,
  color,
  size = "md",
}: {
  icon: string | null;
  color: string | null;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`flex flex-none items-center justify-center rounded-[8px] ${
        size === "sm" ? "size-8" : "size-9"
      } ${CATEGORY_SWATCH[categoryColor(color)].tile}`}
    >
      <Icon name={categoryIcon(icon)} size={size === "sm" ? 16 : 18} />
    </span>
  );
}
