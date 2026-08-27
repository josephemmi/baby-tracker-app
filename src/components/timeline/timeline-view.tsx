"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  groupEntriesIntoMoments,
  type EntryRow,
  type Moment,
} from "@/lib/entries";
import { MomentsTable } from "@/components/log/moments-table";
import { DeletedBanner } from "@/components/timeline/deleted-banner";

type Filter = "all" | "bottle" | "breast" | "poop" | "pee" | "pump";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "bottle", label: "Bottle" },
  { value: "breast", label: "Breast" },
  { value: "poop", label: "Poo" },
  { value: "pee", label: "Pee" },
  { value: "pump", label: "Pump" },
];

// How long the restored-entry highlight stays lit — matches the .row-flash
// animation duration in globals.css, plus a small margin before the
// ?flash= param gets stripped from the URL.
const FLASH_CLEAR_MS = 1600;

interface TimelineViewProps {
  entries: EntryRow[];
  memberNames: Record<string, string>;
  deletedCount: number;
  flashEntryId: string | null;
}

export function TimelineView({
  entries,
  memberNames,
  deletedCount,
  flashEntryId,
}: TimelineViewProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const router = useRouter();

  const moments = useMemo(() => groupEntriesIntoMoments(entries), [entries]);

  // The restore flow (Recently Deleted -> Restore) lands back here with
  // ?flash=<entryId> — resolve that to the moment key MomentsTable already
  // knows how to highlight, rather than inventing a second highlight path.
  const flashMomentKey = useMemo(() => {
    if (!flashEntryId) return null;
    const match = moments.find((moment) =>
      [moment.feed?.id, moment.pee?.id, moment.poop?.id, moment.pump?.id].includes(
        flashEntryId,
      ),
    );
    return match?.key ?? null;
  }, [moments, flashEntryId]);

  useEffect(() => {
    if (!flashMomentKey) return;
    document
      .querySelector(".row-flash")
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [flashMomentKey]);

  useEffect(() => {
    if (!flashEntryId) return;
    const id = window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("flash");
      router.replace(url.pathname + url.search, { scroll: false });
    }, FLASH_CLEAR_MS);
    return () => window.clearTimeout(id);
  }, [flashEntryId, router]);

  const filteredMoments = useMemo(() => {
    if (filter === "all") return moments;
    if (filter === "bottle") return moments.filter((m) => m.feed?.bottle);
    if (filter === "breast") return moments.filter((m) => m.feed?.breast);
    return moments.filter((moment) => moment[filter]);
  }, [moments, filter]);

  const groupedByDay = useMemo(() => {
    const groups = new Map<string, Moment[]>();

    for (const moment of filteredMoments) {
      const dayKey = new Date(moment.timestamp).toLocaleDateString(
        undefined,
        { weekday: "long", month: "long", day: "numeric", year: "numeric" },
      );
      const list = groups.get(dayKey) ?? [];
      list.push(moment);
      groups.set(dayKey, list);
    }

    return Array.from(groups.entries());
  }, [filteredMoments]);

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Filter by type" className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 text-[12.5px] font-bold transition-colors ${
              filter === f.value
                ? "border-ink bg-ink text-paper-raised"
                : "border-line-strong text-ink-soft hover:bg-paper-raised"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <DeletedBanner deletedCount={deletedCount} />

      {groupedByDay.length === 0 ? (
        <p className="text-sm text-ink-soft">
          {entries.length === 0
            ? "No entries yet."
            : "No entries match this filter."}
        </p>
      ) : (
        groupedByDay.map(([day, dayMoments]) => (
          <div key={day} className="flex flex-col gap-2">
            <h2 className="text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase">
              {day}
            </h2>
            <MomentsTable
              moments={dayMoments}
              memberNames={memberNames}
              timeFormat="time"
              flashMomentKey={flashMomentKey}
            />
          </div>
        ))
      )}
    </div>
  );
}
