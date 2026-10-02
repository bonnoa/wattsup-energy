import { describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { householdContextFor, type HouseholdContext } from "@/server/context";

let seq = 0;

/** Crée un utilisateur et son foyer dans la base de test, renvoie son contexte. */
export async function createTestHousehold(label = "foyer"): Promise<HouseholdContext> {
  seq += 1;
  const email = `${label}-${Date.now()}-${seq}@wattsup.test`;
  const res = await auth.api.signUpEmail({
    body: { email, password: "motdepasse-de-test", name: label },
  });
  return householdContextFor(res.user.id);
}

export interface IsolationCase<R> {
  /** Crée une ressource appartenant au foyer B. */
  setup: (b: HouseholdContext) => Promise<R>;
  /** Le foyer A tente d'agir sur la ressource de B (lecture, écriture ou suppression). */
  attempt: (a: HouseholdContext, resource: R) => Promise<unknown>;
  /**
   * Résultat attendu de la tentative : "empty" (null, undefined ou tableau vide)
   * ou "throws". Par défaut, l'un ou l'autre est accepté.
   */
  expect?: "empty" | "throws";
  /** Vérifie que la ressource de B est intacte après la tentative. */
  untouched?: (b: HouseholdContext, resource: R) => Promise<void>;
}

const isEmpty = (v: unknown) =>
  v === null || v === undefined || (Array.isArray(v) && v.length === 0);

/** Exécute un cas d'isolation ; lève une erreur d'assertion en cas de fuite. */
export async function checkIsolation<R>(c: IsolationCase<R>): Promise<void> {
  const a = await createTestHousehold("a");
  const b = await createTestHousehold("b");
  const resource = await c.setup(b);

  let threw = false;
  let result: unknown;
  try {
    result = await c.attempt(a, resource);
  } catch {
    threw = true;
  }

  if (c.expect === "throws") expect(threw, "la tentative aurait dû échouer").toBe(true);
  else if (c.expect === "empty") expect(isEmpty(result), "résultat non vide").toBe(true);
  else expect(threw || isEmpty(result), `fuite : ${JSON.stringify(result)}`).toBe(true);

  await c.untouched?.(b, resource);
}

/**
 * Déclare un test vérifiant qu'une opération exécutée en tant que foyer A ne lit
 * ni ne modifie rien chez le foyer B. À utiliser pour chaque opération serveur.
 */
export function describeTenantIsolation<R>(name: string, c: IsolationCase<R>): void {
  describe(`isolation multi-tenant : ${name}`, () => {
    it("le foyer A n'accède pas aux données du foyer B", () => checkIsolation(c));
  });
}
