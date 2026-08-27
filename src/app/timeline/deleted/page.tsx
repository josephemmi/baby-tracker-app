import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { RecentlyDeletedView } from "@/components/timeline/recently-deleted-view";
import { TIMELINE_PAGE_SIZE, retentionCutoffISO } from "@/lib/entries";
import { colorIndexFor } from "@/lib/person-colors";

export default async function RecentlyDeletedPage() {
  const { user, profile, household } = await getCurrentUserAndProfile();

  if (!user) redirect("/login");
  if (!profile || !household) redirect("/onboarding");

  const supabase = await createClient();

  const [{ data: babies }, { data: members }] = await Promise.all([
    supabase
      .from("babies")
      .select("*")
      .eq("household_id", household.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("users")
      .select("*")
      .eq("household_id", household.id)
      .order("created_at", { ascending: true }),
  ]);

  const baby = babies?.[0] ?? null;
  const memberNames = Object.fromEntries(
    (members ?? []).map((member) => [member.id, member.name]),
  );
  const memberColorIndex = Object.fromEntries(
    (members ?? []).map((member) => [
      member.id,
      colorIndexFor(members ?? [], member.id),
    ]),
  );

  if (!baby) redirect("/timeline");

  const retentionCutoff = retentionCutoffISO();

  const { data: deletedEntries } = await supabase
    .from("entries")
    .select("*")
    .eq("baby_id", baby.id)
    .not("deleted_at", "is", null)
    .gt("deleted_at", retentionCutoff)
    .order("deleted_at", { ascending: false });

  return (
    <div className="min-h-screen bg-paper p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <RecentlyDeletedView
          babyId={baby.id}
          entries={deletedEntries ?? []}
          memberNames={memberNames}
          memberColorIndex={memberColorIndex}
          pageSize={TIMELINE_PAGE_SIZE}
        />
      </div>
    </div>
  );
}
