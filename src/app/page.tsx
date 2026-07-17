import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import { AddBabyForm } from "@/components/baby/add-baby-form";
import { LogMatrix } from "@/components/log/log-matrix";

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
    supabase.from("users").select("*").eq("household_id", household.id),
  ]);

  const baby = babies?.[0] ?? null;

  const { data: entries } = baby
    ? await supabase
        .from("entries")
        .select("*")
        .eq("baby_id", baby.id)
        .order("timestamp", { ascending: false })
        .limit(100)
    : { data: [] };

  return (
    <div className="min-h-screen bg-zinc-50 p-4 dark:bg-black sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <AppHeader
          householdName={household.name}
          inviteCode={household.invite_code}
          profileName={profile.name}
          active="log"
        />

        {!baby ? (
          <AddBabyForm householdId={household.id} />
        ) : (
          <LogMatrix
            babyId={baby.id}
            currentUserId={user.id}
            members={members ?? []}
            initialEntries={entries ?? []}
          />
        )}
      </div>
    </div>
  );
}
