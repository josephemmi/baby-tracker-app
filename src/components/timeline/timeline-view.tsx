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
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded px-3 py-1.5 text-sm ${
              filter === f.value
                ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                : "bg-zinc-100 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groupedByDay.length === 0 ? (
        <p className="text-sm text-zinc-500">No entries yet.</p>
      ) : (
        groupedByDay.map(([day, dayMoments]) => (
          <div key={day} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
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
