import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { activeProfileLabels } from "@/domain/profile";
import { listUsers } from "@/server/admin";
import { pageContext } from "@/server/page";
import { UsersTable, type UserRow } from "./users-table";

export const metadata = { title: "Utilisateurs · WattsUp Energy" };

const day = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

/** Administration (SPEC §9, Utilisateurs) : comptes de l'instance, désactivation, suppression. */
export default async function UsersPage() {
  const ctx = await pageContext("/admin/utilisateurs");
  if (!ctx.isAdmin) redirect("/");
  const users = await listUsers(ctx);
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
    </>
  );
}
