import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import { ReportsView } from "@/components/reports/reports-view";
import { colorIndexFor } from "@/lib/person-colors";

export default async function ReportsPage() {
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

  const { data: entries } = baby
    ? await supabase
        .from("entries")
        .select("*")
        .eq("baby_id", baby.id)
        .order("timestamp", { ascending: true })
    : { data: [] };

  return (
    <div className="min-h-screen bg-paper p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <AppHeader
          householdName={household.name}
          inviteCode={household.invite_code}
          profileName={profile.name}
          profileColorIndex={colorIndexFor(members ?? [], user.id)}
          active="reports"
        />

        {!baby ? (
          <p className="text-sm text-ink-soft">
            Add your baby from the Log tab first.
          </p>
        ) : (
          <ReportsView entries={entries ?? []} babyId={baby.id} />
        )}
      </div>
    </div>
  );
}
