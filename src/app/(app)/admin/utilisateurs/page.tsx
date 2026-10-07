import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { pushState } from "@/domain/ingest/push-state";
import { activeProfileLabels } from "@/domain/profile";
import { formatAgo } from "@/lib/format";
import { listUsers } from "@/server/admin";
import { getSignupPolicy } from "@/server/instance";
import { pageContext } from "@/server/page";
import { SignupCard } from "./signup-card";
import { UsersTable, type UserRow } from "./users-table";

export const metadata = { title: "Utilisateurs · WattsUp Energy" };

const day = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

/**
 * Administration (SPEC §9, Utilisateurs) : comptes de l'instance, désactivation, suppression,
 * et mode d'inscription.
 */
export default async function UsersPage() {
  const ctx = await pageContext("/admin/utilisateurs");
  if (!ctx.isAdmin) redirect("/");
  const [users, policy] = await Promise.all([listUsers(ctx), getSignupPolicy()]);
  const now = Date.now();
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdOn: day(u.createdAt),
    disabledOn: u.disabledAt ? day(u.disabledAt) : null,
    isAdmin: u.isAdmin,
    self: u.id === ctx.userId,
    profiles: u.profile ? activeProfileLabels(u.profile) : [],
    categories: u.categories,
    values: u.values,
    lastPush: {
      state: pushState(u.lastPushAt?.getTime() ?? null, now, u.granularity ?? "hourly"),
      ago: u.lastPushAt ? formatAgo(now - u.lastPushAt.getTime()) : null,
      at: u.lastPushAt ? u.lastPushAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : null,
    },
  }));
  const disabled = rows.filter((r) => r.disabledOn).length;
  return (
    <>
      <PageHeader
        title="Utilisateurs"
        subtitle={`Administration · ${rows.length} compte${rows.length > 1 ? "s" : ""}${
          disabled > 0 ? `, dont ${disabled} désactivé${disabled > 1 ? "s" : ""}` : ""
        }`}
      />
      <UsersTable rows={rows} />
      <div className="max-w-2xl">
        <SignupCard mode={policy.mode} codes={policy.codes} source={policy.source} />
      </div>
    </>
  );
}
