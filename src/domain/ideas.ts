// Boîte à idées (SPEC §9) : statuts, saisie, filtre et recherche. Pur.

export const IDEA_STATUSES = ["new", "planned", "in_progress", "done"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

/** Libellés (une idée : accord au féminin). « Proposée » : pas encore examinée. */
export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  new: "Proposée",
  planned: "Planifiée",
  in_progress: "En cours",
  done: "Terminée",
};

export const IDEA_TITLE_MAX = 60;
export const IDEA_DESCRIPTION_MAX = 1000;

/** Ce que le filtre et le tri lisent d'une idée. */
export interface IdeaListItem {
  id: string;
  title: string;
  description: string;
  status: IdeaStatus;
  votes: number;
  /** Instant ISO. */
  createdAt: string;
}

/** Minuscules sans accents, espaces resserrés : la recherche ignore accents et casse. */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Idées du statut choisi qui contiennent la recherche ; les plus votées, puis les plus récentes. */
export function filterIdeas<T extends IdeaListItem>(
  ideas: readonly T[],
  status: IdeaStatus | "all",
  query: string,
): T[] {
  const q = fold(query);
  return ideas
    .filter((i) => status === "all" || i.status === status)
    .filter((i) => !q || fold(`${i.title} ${i.description}`).includes(q))
    .sort((a, b) => b.votes - a.votes || b.createdAt.localeCompare(a.createdAt));
}

/** Nombre d'idées par statut, et au total (pastilles du filtre). */
export function statusCounts(ideas: readonly IdeaListItem[]): Record<IdeaStatus | "all", number> {
  const counts = { all: ideas.length, new: 0, planned: 0, in_progress: 0, done: 0 };
  for (const i of ideas) counts[i.status] += 1;
  return counts;
}

const clean = (s: string) => s.replace(/[ \t]+/g, " ").trim();

/** Titre (exigé) et description d'une idée, nettoyés et bornés. */
export function parseIdeaInput(input: {
  title: unknown;
  description: unknown;
}): { ok: true; value: { title: string; description: string } } | { ok: false; errors: string[] } {
  const title = typeof input.title === "string" ? clean(input.title) : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const errors: string[] = [];
  if (!title) errors.push("Donnez un titre à votre idée.");
  else if (title.length > IDEA_TITLE_MAX)
    errors.push(`Titre : ${IDEA_TITLE_MAX} caractères au plus.`);
  if (description.length > IDEA_DESCRIPTION_MAX) {
    errors.push(`Description : ${IDEA_DESCRIPTION_MAX} caractères au plus.`);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { title, description } };
}

/** Version qui livre une idée terminée (« 1.2.0 », « v1.2 », « 1.2.3-beta.1 ») ; null sinon. */
export function parseVersion(raw: string): string | null {
  const v = raw.trim().replace(/^v/i, "");
  return /^\d+\.\d+(\.\d+)?([-+][0-9A-Za-z.-]+)?$/.test(v) ? v : null;
}
