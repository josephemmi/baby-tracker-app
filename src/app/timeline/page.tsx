import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserAndProfile } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import { TimelineView } from "@/components/timeline/timeline-view";
import { colorIndexFor } from "@/lib/person-colors";
import {
  TIMELINE_PAGE_SIZE,
  retentionCutoffISO,
  groupEntriesIntoMoments,
} from "@/lib/entries";

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; flash?: string }>;
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
  const memberNames = Object.fromEntries(
    (members ?? []).map((member) => [member.id, member.name]),
  );

  const { page: pageParam, flash } = await searchParams;
  const requestedPage = Number(pageParam) || 1;
  const page = Math.max(1, Math.floor(requestedPage));
  const from = (page - 1) * TIMELINE_PAGE_SIZE;
  const to = from + TIMELINE_PAGE_SIZE - 1;

  const retentionCutoff = retentionCutoffISO();

  const [{ data: entries, count }, { data: deletedEntries }] = baby
    ? await Promise.all([
        supabase
          .from("entries")
          .select("*", { count: "exact" })
          .eq("baby_id", baby.id)
          .is("deleted_at", null)
          .order("timestamp", { ascending: false })
          .range(from, to),
        // Independent of pagination — the banner (JOS-20) reflects the
        // household's total recoverable count, not just this page. Fetched
        // as rows (not a head-count) because the banner counts cards
        // (moments), the same unit delete/restore operate on — a deleted
        // "pee + poo" is one card, not two, so a raw row count would
        // overcount it. The retention window keeps this small.
        supabase
          .from("entries")
          .select("*")
          .eq("baby_id", baby.id)
          .not("deleted_at", "is", null)
          .gt("deleted_at", retentionCutoff),
      ])
    : [{ data: [], count: 0 }, { data: [] }];

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / TIMELINE_PAGE_SIZE));
  const deletedCount = groupEntriesIntoMoments(deletedEntries ?? []).length;

  return (
    <div className="min-h-screen bg-paper p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <AppHeader
          householdName={household.name}
          inviteCode={household.invite_code}
          profileName={profile.name}
          profileColorIndex={colorIndexFor(members ?? [], user.id)}
          active="timeline"
        />

        {!baby ? (
          <p className="text-sm text-ink-soft">
            Add your baby from the Log tab first.
          </p>
        ) : (
          <>
            <TimelineView
              entries={entries ?? []}
              memberNames={memberNames}
              deletedCount={deletedCount}
              flashEntryId={flash ?? null}
            />

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 text-[13.5px] font-bold text-ink-soft">
                {page > 1 ? (
                  <Link
                    href={`/timeline?page=${page - 1}`}
                    className="rounded-full border border-line-strong px-3 py-1.5 text-ink transition-colors hover:bg-paper-raised"
                  >
                    ← Newer
                  </Link>
                ) : (
                  <span className="rounded-full border border-line px-3 py-1.5 text-line-strong">
                    ← Newer
                  </span>
                )}
                <span className="tabular-nums">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={`/timeline?page=${page + 1}`}
                    className="rounded-full border border-line-strong px-3 py-1.5 text-ink transition-colors hover:bg-paper-raised"
                  >
                    Older →
                  </Link>
                ) : (
                  <span className="rounded-full border border-line px-3 py-1.5 text-line-strong">
                    Older →
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
