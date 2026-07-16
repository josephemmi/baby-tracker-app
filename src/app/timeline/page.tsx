import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import { TimelineView } from "@/components/timeline/timeline-view";

export default async function TimelinePage() {
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
    supabase.from("users").select("*").eq("household_id", household.id),
  ]);

  const baby = babies?.[0] ?? null;
  const memberNames = Object.fromEntries(
    (members ?? []).map((member) => [member.id, member.name]),
  );

  const { data: entries } = baby
    ? await supabase
        .from("entries")
        .select("*")
        .eq("baby_id", baby.id)
        .order("timestamp", { ascending: false })
        .limit(1000)
    : { data: [] };

  return (
    <div className="min-h-screen bg-zinc-50 p-4 dark:bg-black sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <AppHeader
          householdName={household.name}
          inviteCode={household.invite_code}
          profileName={profile.name}
          active="timeline"
        />

        {!baby ? (
          <p className="text-sm text-zinc-500">
            Add your baby from the Log tab first.
          </p>
        ) : (
          <TimelineView entries={entries ?? []} memberNames={memberNames} />
        )}
      </div>
    </div>
  );
}
