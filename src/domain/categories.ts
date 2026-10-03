import { z } from "zod";
import { categorySlug } from "./ingest/schema";

// Postes de consommation (SPEC §5, T19) : chaque poste correspond à une clé du bloc
// `categories` du payload d'ingestion (son slug). Fonctions pures.

/** Pictogrammes proposés pour un poste (tracés dans src/components/ui/icon.tsx). */
export const CATEGORY_ICONS = [
  "droplet",
  "flame",
  "plug",
  "car",
  "washer",
  "snowflake",
  "fan",
  "waves",
  "monitor",
  "home",
] as const;

/** Couleurs proposées : noms des tokens de la charte (SPEC §2). */
export const CATEGORY_COLORS = ["grid", "solar", "battery", "pellet", "wood", "eheat"] as const;

export type CategoryIcon = (typeof CATEGORY_ICONS)[number];
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

/** Slug proposé à partir du nom : minuscules sans accents, tirets entre les mots. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

const categoryInput = z.object({
  name: z.string().trim().min(1, "nom requis").max(40, "40 caractères au plus"),
  slug: categorySlug,
  icon: z.enum(CATEGORY_ICONS, "icône inconnue"),
  color: z.enum(CATEGORY_COLORS, "couleur inconnue"),
  isHeating: z.boolean(),
});

export type CategoryInput = z.infer<typeof categoryInput>;

export function parseCategoryInput(
  input: unknown,
): { success: true; data: CategoryInput } | { success: false; errors: string[] } {
  const r = categoryInput.safeParse(input);
  return r.success
    ? { success: true, data: r.data }
    : { success: false, errors: r.error.issues.map((i) => i.message) };
}

/**
 * Slugs envoyés par Home Assistant mais inconnus du foyer (avertissements
 * `unknown_category` des derniers envois), dans l'ordre d'apparition.
 */
export function unknownSlugs(warningLists: unknown[], existing: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const list of warningLists) {
    if (!Array.isArray(list)) continue;
    for (const w of list) {
      if (
        typeof w === "object" &&
        w !== null &&
        "code" in w &&
        w.code === "unknown_category" &&
        "key" in w &&
        typeof w.key === "string" &&
        !existing.includes(w.key)
      ) {
        seen.add(w.key);
      }
    }
  }
  return [...seen];
}
