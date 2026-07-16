import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/sign-out-button";
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
  const memberNames = Object.fromEntries(
    (members ?? []).map((member) => [member.id, member.name]),
  );

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
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {household.name}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Logged in as {profile.name} · Invite code:{" "}
              <span className="font-mono">{household.invite_code}</span>
            </p>
          </div>
          <SignOutButton />
        </header>

        {!baby ? (
          <AddBabyForm householdId={household.id} />
        ) : (
          <LogMatrix
            babyId={baby.id}
            currentUserId={user.id}
            memberNames={memberNames}
            initialEntries={entries ?? []}
          />
        )}
      </div>
    </div>
  );
}
