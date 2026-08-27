import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import { AddBabyForm } from "@/components/baby/add-baby-form";
import { LogMatrix } from "@/components/log/log-matrix";
import { colorIndexFor } from "@/lib/person-colors";
import { HOME_ROW_SAFETY_CAP, homeFetchWindowStartISO } from "@/lib/entries";

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

  // Home shows today in full plus yesterday's tail (JOS-21) — fetch by a
  // generous time window instead of a flat row count, so "today" can never
  // be silently truncated by an arbitrary cap. A separate cheap existence
  // check covers the case where nothing in the window is older than
  // yesterday but real history exists further back (a logging gap) — the
  // window fetch alone can't detect that on its own.
  const windowStart = homeFetchWindowStartISO();

  const [{ data: fetchedEntries, count: windowCount }, { count: olderCount }] = baby
    ? await Promise.all([
        supabase
          .from("entries")
          .select("*", { count: "exact" })
          .eq("baby_id", baby.id)
          .is("deleted_at", null)
          .gte("timestamp", windowStart)
          .order("timestamp", { ascending: false })
          .limit(HOME_ROW_SAFETY_CAP),
        supabase
          .from("entries")
          .select("*", { count: "exact", head: true })
          .eq("baby_id", baby.id)
          .is("deleted_at", null)
          .lt("timestamp", windowStart),
      ])
    : [{ data: [], count: 0 }, { count: 0 }];

  const entries = fetchedEntries ?? [];
  const hasMoreEntries = (windowCount ?? 0) > HOME_ROW_SAFETY_CAP || (olderCount ?? 0) > 0;

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
