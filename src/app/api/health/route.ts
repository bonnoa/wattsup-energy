import { sql } from "@/db";

// Santé de l'instance (healthcheck Docker et Coolify) : application + base.

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await sql`select 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, db: "injoignable" }, { status: 503 });
  }
}
