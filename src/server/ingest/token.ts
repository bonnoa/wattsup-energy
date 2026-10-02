import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { ingestToken } from "@/db/schema";
import type { HouseholdContext } from "../context";

// Token d'ingestion : "wu_" + 32 octets aléatoires en base62. Seul son sha-256 est
// stocké ; la recherche se fait par hash (index unique), sans comparaison de chaînes
// sur le secret, donc sans fuite temporelle exploitable.

const PREFIX = "wu_";
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BODY_LENGTH = 43; // 32 octets ≈ 42,99 caractères base62
const DISPLAY_PREFIX_LENGTH = 11; // "wu_" + 8 caractères

function base62(bytes: Buffer, length: number): string {
  let n = BigInt(`0x${bytes.toString("hex")}`);
  let out = "";
  for (let i = 0; i < length; i++) {
    out = BASE62[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export interface CreatedToken {
  /** Token en clair : à afficher une seule fois, jamais stocké. */
  token: string;
  prefix: string;
}

/** Crée un nouveau token et révoque le précédent. */
export async function createIngestToken(ctx: HouseholdContext): Promise<CreatedToken> {
  const token = PREFIX + base62(randomBytes(32), BODY_LENGTH);
  const prefix = token.slice(0, DISPLAY_PREFIX_LENGTH);
  await db.transaction(async (tx) => {
    await tx
      .update(ingestToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(ingestToken.householdId, ctx.householdId), isNull(ingestToken.revokedAt)));
    await tx
      .insert(ingestToken)
      .values({ householdId: ctx.householdId, prefix, hash: sha256(token) });
  });
  return { token, prefix };
}

export async function revokeIngestToken(ctx: HouseholdContext): Promise<void> {
  await db
    .update(ingestToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(ingestToken.householdId, ctx.householdId), isNull(ingestToken.revokedAt)));
}

export async function getActiveIngestToken(ctx: HouseholdContext) {
  const [row] = await db
    .select({
      prefix: ingestToken.prefix,
      createdAt: ingestToken.createdAt,
      lastUsedAt: ingestToken.lastUsedAt,
    })
    .from(ingestToken)
    .where(and(eq(ingestToken.householdId, ctx.householdId), isNull(ingestToken.revokedAt)));
  return row ?? null;
}

const TOKEN_PATTERN = new RegExp(`^Bearer (${PREFIX}[0-9A-Za-z]{${BODY_LENGTH}})$`);

/** Authentifie un en-tête Authorization ; null si absent, mal formé, inconnu ou révoqué. */
export async function verifyIngestToken(
  header: string | null,
): Promise<{ householdId: string; tokenId: string } | null> {
  const token = header ? TOKEN_PATTERN.exec(header)?.[1] : undefined;
  if (!token) return null;
  const [row] = await db
    .update(ingestToken)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(ingestToken.hash, sha256(token)), isNull(ingestToken.revokedAt)))
    .returning({ householdId: ingestToken.householdId, tokenId: ingestToken.id });
  return row ?? null;
}
