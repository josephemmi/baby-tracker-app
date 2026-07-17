"use client";

import { useEffect, useState } from "react";
import { formatTimeAgo, latestEntryOfType, type EntryRow } from "@/lib/entries";

export function LastFeedWidget({ entries }: { entries: EntryRow[] }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const lastFeed = latestEntryOfType(entries, "feed");

  return (
    <div className="rounded-[10px] border border-line bg-paper-raised p-4 shadow-card">
      <p className="text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase">
        Last feed
      </p>
      {lastFeed ? (
        <p className="text-2xl font-bold tabular-nums text-ink">
          {formatTimeAgo(lastFeed.timestamp, now)}
          {lastFeed.amount_ml != null && (
            <span className="ml-2 text-sm font-normal text-ink-soft">
              {lastFeed.amount_ml} mL
            </span>
          )}
        </p>
      ) : (
        <p className="text-2xl font-bold text-ink-soft">No feeds logged yet</p>
      )}
    </div>
  );
}
