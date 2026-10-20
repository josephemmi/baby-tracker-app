"use client";

import { useEffect, useMemo, useState } from "react";
import { formatTimeAgo, latestEntryOfType, type EntryRow } from "@/lib/entries";
import type { EntryType } from "@/lib/supabase/database.types";
import type { Sleep } from "@/lib/sleep";
import { glance, toReportSleeps } from "@/lib/sleep-reports";
import { lastSleepTile } from "@/lib/sleep-report-view";
import { SleepPill } from "@/components/sleep/sleep-pill";
import { useServerNow } from "@/components/log/use-server-now";

const CARDS: { type: EntryType; label: string }[] = [
  { type: "feed", label: "Last feed" },
  { type: "poop", label: "Last poo" },
  { type: "pee", label: "Last pee" },
];

const CARD = "rounded-[10px] border border-line bg-paper-raised p-4 shadow-card";
const LABEL = "text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase";

export function GlanceCards({ entries, sleeps }: { entries: EntryRow[]; sleeps: Sleep[] }) {
  // Entries are stamped by the phone that logged them, so "ago" is read
  // against the phone's own clock.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Sleeps are stamped by the server, so the Last sleep tile reads the
  // server-corrected clock (like the sleep cards). It ticks every second while
  // a sleep is open, so the pill agrees with the card's timer, else every 30 s.
  const sleepNow = useServerNow(sleeps.some((s) => s.closedAt == null) ? 1000 : 30_000);
  const sleepTile = useMemo(
    () => lastSleepTile(glance(toReportSleeps(sleeps, sleepNow), sleepNow), sleepNow),
    [sleeps, sleepNow],
  );

  return (
    // One column on a phone, as before; two by two once there is room. Four
    // across leave a tile too narrow for the "Sleeping now" pill.
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {CARDS.map(({ type, label }) => {
        const latest = latestEntryOfType(entries, type);
        return (
          <div key={type} className={CARD}>
            <p className={LABEL}>{label}</p>
            {latest ? (
              <p className="text-2xl font-bold tabular-nums text-ink">
                {formatTimeAgo(latest.timestamp, now)}
                {type === "feed" &&
                  (() => {
                    const parts = [
                      latest.bottle &&
                        (latest.amount_ml != null
                          ? `${latest.amount_ml} mL`
                          : "Bottle"),
                      latest.breast && "Breastfed",
                    ].filter(Boolean);
                    return (
                      parts.length > 0 && (
                        <span className="ml-2 text-sm font-normal text-ink-soft">
                          {parts.join(" + ")}
                        </span>
                      )
                    );
                  })()}
              </p>
            ) : (
              <p className="text-2xl font-bold text-ink-soft">Not logged yet</p>
            )}
          </div>
        );
      })}

      {/* Last sleep (JOS-83). Like the tiles above it shows the last COMPLETED
          sleep and changes only when a sleep completes, or when the newest is
          deleted and the one before it comes back. While one is open a pill
          says so; the value does not move. */}
      <div className={CARD} data-tile="last-sleep">
        <p className={LABEL}>Last sleep</p>
        {sleepTile.none ? (
          <p className="text-2xl font-bold text-ink-soft">{sleepTile.value}</p>
        ) : (
          <p className="text-2xl font-bold tabular-nums text-ink">
            {sleepTile.value}{" "}
            <span className="ml-1 text-sm font-normal text-ink-soft">{sleepTile.detail}</span>
          </p>
        )}
        {sleepTile.pill && <SleepPill pill={sleepTile.pill} className="mt-3" />}
      </div>
    </div>
  );
}
