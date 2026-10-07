import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { idea, ideaVote, user } from "@/db/schema";
import type { MailContent } from "@/domain/mail";
import { ForbiddenError } from "@/server/admin";
import type { HouseholdContext } from "@/server/context";
import { createIdea, deleteIdea, listIdeas, setIdeaStatus, toggleVote } from "@/server/ideas";
import { createTestHousehold, describeTenantIsolation } from "../helpers/tenancy";

const silent = async () => {};
const propose = (ctx: HouseholdContext, title = "Thème sombre") =>
  createIdea(ctx, { title, description: "Pour le soir." }, { url: "", notify: silent });

const asAdmin = (ctx: HouseholdContext): HouseholdContext => ({ ...ctx, isAdmin: true });
const find = async (ctx: HouseholdContext, id: string) =>
  (await listIdeas(ctx)).find((i) => i.id === id);

describe("boîte à idées", () => {
  it("proposer : l'administrateur est prévenu avec le titre, l'auteur et le lien", async () => {
    const a = { ...(await createTestHousehold("a")), userName: "Élise", userEmail: "e@x.test" };
    const sent: MailContent[] = [];
    await createIdea(
      a,
      { title: "Export Excel", description: "" },
      { url: "https://w.test/idees", notify: async (m) => void sent.push(m) },
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe("Nouvelle idée : Export Excel");
    expect(sent[0]?.text).toContain("Élise <e@x.test>");
    expect(sent[0]?.text).toContain("https://w.test/idees");
  });

  it("liste commune ; l'auteur n'est visible que de l'administrateur", async () => {
    const a = await createTestHousehold("a");
    const b = await createTestHousehold("b");
    const id = await propose(a);
    expect((await find(b, id))?.title).toBe("Thème sombre");
    expect((await find(b, id))?.author).toBeNull();
    expect((await find(asAdmin(b), id))?.author).toMatch(/^a </);
  });

  it("un vote par compte, retiré au second clic", async () => {
    const a = await createTestHousehold("a");
    const b = await createTestHousehold("b");
    const id = await propose(a);
    expect(await toggleVote(a, id)).toEqual({ voted: true });
    expect(await toggleVote(b, id)).toEqual({ voted: true });
    expect(await find(a, id)).toMatchObject({ votes: 2, voted: true });
    expect(await toggleVote(a, id)).toEqual({ voted: false });
    expect(await find(a, id)).toMatchObject({ votes: 1, voted: false });
    expect(await find(b, id)).toMatchObject({ votes: 1, voted: true });
    expect(await toggleVote(a, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("statut par l'administrateur : version gardée pour « terminée » seulement", async () => {
    const admin = asAdmin(await createTestHousehold("admin"));
    const id = await propose(admin);
    expect(await setIdeaStatus(admin, id, "done", "1.2.0")).toBe(true);
    expect(await find(admin, id)).toMatchObject({ status: "done", version: "1.2.0" });
    expect(await setIdeaStatus(admin, id, "in_progress", "1.2.0")).toBe(true);
    expect(await find(admin, id)).toMatchObject({ status: "in_progress", version: null });
  });

  it("supprimer une idée emporte ses votes", async () => {
    const admin = asAdmin(await createTestHousehold("admin"));
    const id = await propose(admin);
    await toggleVote(admin, id);
    expect(await deleteIdea(admin, id)).toBe(true);
    expect(await db.$count(ideaVote, eq(ideaVote.ideaId, id))).toBe(0);
    expect(await deleteIdea(admin, id)).toBe(false);
  });

  it("compte supprimé : ses idées restent, sans auteur ; ses votes partent", async () => {
    const a = await createTestHousehold("a");
    const b = await createTestHousehold("b");
    const id = await propose(a);
    await toggleVote(a, id);
    await toggleVote(b, id);
    await db.delete(user).where(eq(user.id, a.userId));
    const [row] = await db.select().from(idea).where(eq(idea.id, id));
    expect(row?.authorId).toBeNull();
    expect(await find(asAdmin(b), id)).toMatchObject({ votes: 1, author: null });
  });

  it("statut et suppression refusés à un compte ordinaire", async () => {
    const a = await createTestHousehold("a");
    const id = await propose(a);
    await expect(setIdeaStatus(a, id, "planned", null)).rejects.toThrow(ForbiddenError);
    await expect(deleteIdea(a, id)).rejects.toThrow(ForbiddenError);
  });
});

describeTenantIsolation("statut de l'idée d'un autre compte", {
  setup: (b) => propose(b),
  attempt: (a, id) => setIdeaStatus(a, id, "done", "9.9.9"),
  expect: "throws",
  untouched: async (_b, id) => {
    const [row] = await db.select().from(idea).where(eq(idea.id, id));
    expect(row).toMatchObject({ status: "new", version: null });
  },
});

describeTenantIsolation("suppression de l'idée d'un autre compte", {
  setup: (b) => propose(b),
  attempt: (a, id) => deleteIdea(a, id),
  expect: "throws",
  untouched: async (_b, id) => {
    expect(await db.$count(idea, eq(idea.id, id))).toBe(1);
  },
});

describeTenantIsolation("vote : retirer le vote d'un autre compte", {
  setup: async (b) => {
    const id = await propose(b);
    await toggleVote(b, id);
    return id;
  },
  // A vote pour son propre compte : le vote de B reste.
  attempt: async (a, id) => {
    await toggleVote(a, id);
    return null;
  },
  expect: "empty",
  untouched: async (b, id) => {
    expect(await find(b, id)).toMatchObject({ voted: true, votes: 2 });
  },
});
