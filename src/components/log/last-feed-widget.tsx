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
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Last feed
      </p>
      {lastFeed ? (
        <p className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          {formatTimeAgo(lastFeed.timestamp, now)}
          {lastFeed.amount_ml != null && (
            <span className="ml-2 text-sm font-normal text-zinc-500">
              {lastFeed.amount_ml} mL
            </span>
          )}
        </p>
      ) : (
        <p className="text-lg text-zinc-500">No feeds logged yet</p>
      )}
    </div>
  );
}
