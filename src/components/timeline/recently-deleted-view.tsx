"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  daysLeftToRestore,
  formatTime,
  formatTimeAgo,
  groupEntriesIntoMoments,
  siblingIds,
  type EntryRow,
  type Moment,
} from "@/lib/entries";
import {
  TYPE_STYLES,
  FEED_FLAG_STYLES,
  type CheckboxStyle,
} from "@/components/log/entry-styles";
import { initials, personColor } from "@/lib/person-colors";

const PUMP_STYLE: CheckboxStyle = {
  border: "border-plum",
  bg: "bg-plum-soft",
  check: "text-plum",
  label: "Pump",
};

function entryPill(entry: EntryRow): { key: string; label: string; style: CheckboxStyle } {
  if (entry.type === "pee") return { key: "pee", label: "Pee", style: TYPE_STYLES.pee };
  if (entry.type === "poop") return { key: "poop", label: "Poo", style: TYPE_STYLES.poop };
  if (entry.type === "pump") {
    const ml = entry.amount_ml != null ? ` · ${entry.amount_ml}ml` : "";
    return { key: "pump", label: `Pump${ml}`, style: PUMP_STYLE };
  }

  // feed: bottle and breast are independent flags on the same row, so a
  // single soft-deleted feed entry can represent either or both at once.
  if (entry.bottle && entry.breast) {
    return { key: "feed", label: "Breast + Bottle", style: FEED_FLAG_STYLES.breast };
  }
  if (entry.breast) return { key: "feed", label: "Breast", style: FEED_FLAG_STYLES.breast };
  const ml = entry.bottle && entry.amount_ml != null ? ` · ${entry.amount_ml}ml` : "";
  return { key: "feed", label: `Bottle${ml}`, style: FEED_FLAG_STYLES.bottle };
}

// A moment's own type fields (feed/pee/poop/pump), in the same fixed order
// used everywhere else in the app — so a "card" here reads the same way it
// did in the Log/Timeline screen it was deleted from.
function momentPills(moment: Moment) {
  return [moment.feed, moment.pee, moment.poop, moment.pump]
    .filter((entry): entry is EntryRow => !!entry)
    .map(entryPill);
}

// Deletion (and restore) acts on the whole moment/card at once — same unit
// LogMatrix already deletes as a group — so every sibling entry in it
// shares one deleted_at/deleted_by, making any single entry's a safe pick.
function momentDeletedMeta(moment: Moment) {
  const anyEntry = moment.feed ?? moment.pee ?? moment.poop ?? moment.pump;
  return { deletedAt: anyEntry?.deleted_at ?? null, deletedBy: anyEntry?.deleted_by ?? null };
}

interface RecentlyDeletedViewProps {
  babyId: string;
  entries: EntryRow[];
  memberNames: Record<string, string>;
  memberColorIndex: Record<string, number>;
  pageSize: number;
}

export function RecentlyDeletedView({
  babyId,
  entries: initialEntries,
  memberNames,
  memberColorIndex,
  pageSize,
}: RecentlyDeletedViewProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [collapsingKey, setCollapsingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  // Grouped the same way Log/Timeline group active entries into cards — a
  // deleted "pee + poo" logged together shows and restores as one card,
  // not two separate rows each needing their own tap.
  const moments = useMemo(() => groupEntriesIntoMoments(entries), [entries]);

  async function handleRestore(moment: Moment) {
    setError(null);
    const supabase = createClient();
    const ids = siblingIds(moment);
    if (ids.length === 0) return;

    // Fire the restore and the "where does this land on Timeline" lookup
    // together — Timeline is already paginated (100/page) independent of
    // this feature, so landing back on page 1 could easily miss an older
    // moment entirely. Rank among still-active entries newer than this one
    // tells us exactly which page it now falls on.
    const [{ error: restoreError }, { count: newerActiveCount }] = await Promise.all([
      supabase
        .from("entries")
        .update({ deleted_at: null, deleted_by: null })
        .in("id", ids),
      supabase
        .from("entries")
        .select("*", { count: "exact", head: true })
        .eq("baby_id", babyId)
        .is("deleted_at", null)
        .gt("timestamp", moment.timestamp),
    ]);

    if (restoreError) {
      setError(restoreError.message);
      return;
    }

    const destinationPage = Math.floor((newerActiveCount ?? 0) / pageSize) + 1;

    setCollapsingKey(moment.key);

    // Let the collapse play out before removing the card, then give that a
    // beat to register before jumping back to Timeline — the restore ->
    // navigate -> flash sequence is the actual payoff of this feature.
    window.setTimeout(() => {
      setEntries((prev) => prev.filter((e) => !ids.includes(e.id)));
    }, 300);

    window.setTimeout(() => {
      // Any one id in the moment is enough — Timeline resolves it back to
      // the whole card and flashes that, not just the one type.
      router.push(`/timeline?page=${destinationPage}&flash=${ids[0]}`);
    }, 700);
  }

  return (
    <>
      <Link
        href="/timeline"
        className="flex w-fit items-center gap-1.5 text-[13.5px] font-bold text-ink-soft transition-colors hover:text-ink"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
          <path
            d="M10 3L5 8l5 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Timeline
      </Link>

      <div>
        <h1 className="text-[19px] font-bold tracking-[-0.01em] text-ink">
          Recently Deleted
        </h1>
        <p className="text-[13px] text-ink-soft">
          Kept for 7 days from when they&rsquo;re deleted, then removed for good.
        </p>
      </div>

      {error && <p className="text-sm text-terracotta">{error}</p>}

      {moments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[10px] border border-line bg-paper-raised px-4 py-10 text-center shadow-card">
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8 text-line-strong"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m-9 0v12a2 2 0 002 2h6a2 2 0 002-2V7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="max-w-[280px] text-[13.5px] text-ink-soft">
            Nothing deleted recently. Deleted entries stay here for 7 days before
            they&rsquo;re gone for good.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {moments.map((moment) => {
            const pills = momentPills(moment);
            const { deletedAt, deletedBy } = momentDeletedMeta(moment);
            const deletedByName = (deletedBy && memberNames[deletedBy]) ?? "Unknown";
            const color = personColor(deletedBy ? (memberColorIndex[deletedBy] ?? 0) : 0);
            // Every moment here came from the deleted-entries query, so
            // deletedAt is always set — nullable in the type only because
            // EntryRow itself covers active entries too.
            const days = daysLeftToRestore(deletedAt as string, now);

            return (
              <div
                key={moment.key}
                className={`overflow-hidden rounded-[10px] border border-line bg-paper-raised px-3.5 py-3 shadow-card transition-all duration-300 ${
                  collapsingKey === moment.key
                    ? "max-h-0 scale-95 border-transparent px-0 py-0 opacity-0"
                    : "max-h-40 opacity-100"
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[13.5px] font-bold tabular-nums text-ink">
                    {formatTime(moment.timestamp, "datetime")}
                  </span>
                  <span className="rounded-full border border-line-strong bg-paper px-2 py-0.5 text-[10.5px] font-bold text-ink-soft uppercase tracking-[0.03em]">
                    Deleted
                  </span>
                </div>

                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {pills.map((pill) => (
                    <span
                      key={pill.key}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-bold ${pill.style.border} ${pill.style.bg} ${pill.style.check}`}
                    >
                      {pill.label}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12.5px] text-ink-soft">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full text-[8.5px] font-bold ${color.bg} ${color.text}`}
                      >
                        {initials(deletedByName)}
                      </span>
                      <span>
                        {deletedByName} · {formatTimeAgo(deletedAt as string, now)}
                      </span>
                    </div>
                    <div className="mt-0.5">
                      <b className="text-ink">
                        {days} {days === 1 ? "day" : "days"}
                      </b>{" "}
                      left to restore
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRestore(moment)}
                    disabled={collapsingKey === moment.key}
                    className="shrink-0 rounded-full bg-sage px-4 py-2 text-[13px] font-bold text-paper-raised shadow-card transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Restore
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
