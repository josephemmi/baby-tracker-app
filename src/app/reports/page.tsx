import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import { ReportsShell } from "@/components/reports/reports-shell";
import { colorIndexFor } from "@/lib/person-colors";
import { fetchAllEntries } from "@/lib/entries";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
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

  const entries = baby ? await fetchAllEntries(supabase, baby.id) : [];
  const { tab } = await searchParams;

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
          <ReportsShell
            entries={entries}
            babyId={baby.id}
            initialTab={tab === "sleep" ? "sleep" : "feeds"}
          />
        )}
      </div>
    </div>
  );
}
