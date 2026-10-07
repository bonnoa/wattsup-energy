import { describe, expect, it } from "vitest";
import {
  filterIdeas,
  IDEA_DESCRIPTION_MAX,
  IDEA_TITLE_MAX,
  parseIdeaInput,
  parseVersion,
  statusCounts,
  type IdeaListItem,
} from "@/domain/ideas";

const idea = (over: Partial<IdeaListItem>): IdeaListItem => ({
  id: "x",
  title: "Titre",
  description: "",
  status: "new",
  votes: 0,
  createdAt: "2026-10-01T10:00:00Z",
  ...over,
});

const list = [
  idea({ id: "a", title: "Export Excel", votes: 2, createdAt: "2026-10-01T10:00:00Z" }),
  idea({ id: "b", title: "Thème sombre", votes: 5, status: "planned" }),
  idea({
    id: "c",
    title: "Alertes",
    description: "Prévenir quand le stock de granulés est bas",
    votes: 2,
    status: "done",
    createdAt: "2026-10-03T10:00:00Z",
  }),
];

describe("filterIdeas", () => {
  it("tri par votes décroissants, puis de la plus récente à la plus ancienne", () => {
    expect(filterIdeas(list, "all", "").map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("filtre par statut", () => {
    expect(filterIdeas(list, "done", "").map((i) => i.id)).toEqual(["c"]);
  });

  it("recherche dans le titre et la description, sans accents ni casse", () => {
    expect(filterIdeas(list, "all", "theme").map((i) => i.id)).toEqual(["b"]);
    expect(filterIdeas(list, "all", "  GRANULES ").map((i) => i.id)).toEqual(["c"]);
    expect(filterIdeas(list, "planned", "granulés")).toEqual([]);
  });
});

describe("statusCounts", () => {
  it("compte par statut et au total", () => {
    expect(statusCounts(list)).toEqual({ all: 3, new: 1, planned: 1, in_progress: 0, done: 1 });
  });
});

describe("parseIdeaInput", () => {
  it("titre et description nettoyés", () => {
    expect(parseIdeaInput({ title: "  Thème   sombre ", description: " Pour le soir. " })).toEqual({
      ok: true,
      value: { title: "Thème sombre", description: "Pour le soir." },
    });
  });

  it("titre exigé, longueurs bornées", () => {
    expect(parseIdeaInput({ title: " ", description: "" })).toEqual({
      ok: false,
      errors: ["Donnez un titre à votre idée."],
    });
    const long = parseIdeaInput({
      title: "a".repeat(IDEA_TITLE_MAX + 1),
      description: "b".repeat(IDEA_DESCRIPTION_MAX + 1),
    });
    expect(long).toEqual({
      ok: false,
      errors: [
        `Titre : ${IDEA_TITLE_MAX} caractères au plus.`,
        `Description : ${IDEA_DESCRIPTION_MAX} caractères au plus.`,
      ],
    });
    expect(parseIdeaInput({ title: 1, description: null }).ok).toBe(false);
  });
});

describe("parseVersion", () => {
  it("numéro de version, « v » initial retiré", () => {
    expect(parseVersion("v0.2.0")).toBe("0.2.0");
    expect(parseVersion(" 1.0 ")).toBe("1.0");
    expect(parseVersion("1.2.3-beta.1")).toBe("1.2.3-beta.1");
    expect(parseVersion("bientôt")).toBeNull();
    expect(parseVersion("")).toBeNull();
  });
});
