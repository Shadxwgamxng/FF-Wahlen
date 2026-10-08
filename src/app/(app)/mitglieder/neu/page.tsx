import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { createMember } from "@/actions/members";
import { MemberForm } from "@/components/MemberForm";
import { Flash, PageHeader } from "@/components/ui";

export const metadata = { title: "Neues Mitglied" };

export default async function NewMember({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePermission("members.manage");
  const sp = await searchParams;
  const [ranks, units, offices] = await Promise.all([
    db.rank.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.fireUnit.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.office.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Mitglieder" title="Neues Mitglied" subtitle="Die Daten sind unabhängig von FiveM. Die Discord-Verknüpfung erfolgt nach dem Anlegen." />
      <Flash error={sp.error} />
      <form action={createMember} className="card card-pad max-w-4xl">
        <MemberForm ranks={ranks} units={units} offices={offices} submitLabel="Mitglied anlegen" />
      </form>
    </>
  );
}
