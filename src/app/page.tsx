import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import { AddBabyForm } from "@/components/baby/add-baby-form";
import { LogMatrix } from "@/components/log/log-matrix";
import { colorIndexFor } from "@/lib/person-colors";
import { HOME_ENTRIES_LIMIT } from "@/lib/entries";

export default async function Home() {
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

  const { data: fetchedEntries } = baby
    ? await supabase
        .from("entries")
        .select("*")
        .eq("baby_id", baby.id)
        .is("deleted_at", null)
        .order("timestamp", { ascending: false })
        .limit(HOME_ENTRIES_LIMIT + 1)
    : { data: [] };

  const hasMoreEntries = (fetchedEntries?.length ?? 0) > HOME_ENTRIES_LIMIT;
  const entries = hasMoreEntries
    ? fetchedEntries!.slice(0, HOME_ENTRIES_LIMIT)
    : (fetchedEntries ?? []);

  return (
    <div className="min-h-screen bg-paper p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <AppHeader
          householdName={household.name}
          inviteCode={household.invite_code}
          profileName={profile.name}
          profileColorIndex={colorIndexFor(members ?? [], user.id)}
          active="log"
        />

        {!baby ? (
          <AddBabyForm householdId={household.id} />
        ) : (
          <LogMatrix
            babyId={baby.id}
            currentUserId={user.id}
            members={members ?? []}
            initialEntries={entries}
            hasMoreEntries={hasMoreEntries}
          />
        )}
      </div>
    </div>
  );
}
