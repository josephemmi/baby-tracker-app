"use client";

import { useMemo, useState } from "react";
import {
  groupEntriesIntoMoments,
  type EntryRow,
  type Moment,
} from "@/lib/entries";
import type { EntryType } from "@/lib/supabase/database.types";
import { MomentsTable } from "@/components/log/moments-table";

type Filter = "all" | EntryType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "feed", label: "Feed" },
  { value: "pee", label: "Pee" },
  { value: "poop", label: "Poo" },
];

interface TimelineViewProps {
  entries: EntryRow[];
  memberNames: Record<string, string>;
}

export function TimelineView({ entries, memberNames }: TimelineViewProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const moments = useMemo(() => groupEntriesIntoMoments(entries), [entries]);

  const filteredMoments = useMemo(
    () =>
      filter === "all" ? moments : moments.filter((moment) => moment[filter]),
    [moments, filter],
  );

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
            />
          </div>
        ))
      )}
    </div>
  );
}
