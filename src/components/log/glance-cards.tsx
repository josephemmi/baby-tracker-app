"use client";

import { useEffect, useState } from "react";
import { formatTimeAgo, latestEntryOfType, type EntryRow } from "@/lib/entries";
import type { EntryType } from "@/lib/supabase/database.types";

const CARDS: { type: EntryType; label: string }[] = [
  { type: "feed", label: "Last feed" },
  { type: "poop", label: "Last poo" },
  { type: "pee", label: "Last pee" },
];

export function GlanceCards({ entries }: { entries: EntryRow[] }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {CARDS.map(({ type, label }) => {
        const latest = latestEntryOfType(entries, type);
        return (
          <div
            key={type}
            className="flex-1 rounded-[10px] border border-line bg-paper-raised p-4 shadow-card"
          >
            <p className="text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase">
              {label}
            </p>
            {latest ? (
              <p className="text-2xl font-bold tabular-nums text-ink">
                {formatTimeAgo(latest.timestamp, now)}
                {type === "feed" && latest.amount_ml != null && (
                  <span className="ml-2 text-sm font-normal text-ink-soft">
                    {latest.amount_ml} mL
                  </span>
                )}
              </p>
            ) : (
              <p className="text-2xl font-bold text-ink-soft">Not logged yet</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
