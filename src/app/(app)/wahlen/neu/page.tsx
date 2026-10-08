import { requirePermission } from "@/lib/auth";
import { createElection } from "@/actions/elections";
import { Flash, PageHeader } from "@/components/ui";
import { ElectionGeneralFields } from "@/components/ElectionGeneralFields";
import { toLocalInput } from "@/lib/utils";

export const metadata = { title: "Neue Wahl" };

export default async function NewElection({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePermission("elections.manage");
  const sp = await searchParams;
  const start = new Date(Date.now() + 3600_000);
  const end = new Date(Date.now() + 3 * 86_400_000);
  return (
    <>
      <PageHeader eyebrow="Wahlen" title="Neue Wahl erstellen" subtitle="Die Wahl wird zunächst als Entwurf angelegt. Ämter, Kandidaten und Wahlberechtigte ergänzt du im nächsten Schritt." />
      <Flash error={sp.error} />
      <form action={createElection} className="card card-pad max-w-3xl space-y-5">
        <ElectionGeneralFields defaults={{ startsAt: toLocalInput(start), endsAt: toLocalInput(end), type: "secret", resultsPublic: true }} />
        <div className="flex justify-end"><button className="btn-primary">Entwurf anlegen</button></div>
      </form>
    </>
  );
}
