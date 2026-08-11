"use client";

import { useEffect, useState } from "react";
import type { EntryRow } from "@/lib/entries";
import type { BreastSide } from "@/lib/supabase/database.types";
import {
  canEndBreastSession,
  fmtDuration,
  getBreastDisplaySeconds,
  hasBreastTime,
} from "@/lib/breastfeed-timer";

const SIDE_ON = "border-rose bg-rose-soft text-rose";
const SIDE_OFF = "border-line-strong bg-transparent text-ink-soft";

interface BreastTimerPanelProps {
  entry: EntryRow;
  editable: boolean;
  onToggleSide?: (side: BreastSide) => void;
  onEndSession?: () => void;
  large?: boolean;
}

// Shared by the desktop detail row and the mobile inline panel — the
// interaction is identical, only the surrounding markup differs. Ticks its
// own local re-render once a second, only while a side is actively running,
// purely to trigger a recalculation of the displayed time. The displayed
// value itself always comes from getBreastDisplaySeconds' timestamp math
// (accumulated + elapsed-since-start), never from counting ticks — so it's
// exactly right immediately after a background/foreground gap, and every
// connected device shows the same live time from the same synced timestamp.
export function BreastTimerPanel({
  entry,
  editable,
  onToggleSide,
  onEndSession,
  large = false,
}: BreastTimerPanelProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!entry.breast_active_side) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [entry.breast_active_side, entry.breast_active_started_at]);

  const rightSeconds = getBreastDisplaySeconds(entry, "right");
  const leftSeconds = getBreastDisplaySeconds(entry, "left");

  if (!editable) {
    // Timeline stays read-only everywhere else (e.g. Notes' view-only
    // modal) — an in-progress session gets a live-ticking indicator here,
    // not Start/Pause/End Session controls.
    if (!entry.breast_active_side) return null;
    const activeSeconds = entry.breast_active_side === "right" ? rightSeconds : leftSeconds;
    return (
      <div className="flex items-center gap-2 rounded-[8px] border border-rose bg-rose-soft px-3 py-2 text-[13px] font-bold text-rose">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-rose" aria-hidden="true" />
        {entry.breast_active_side === "right" ? "Right" : "Left"} — {fmtDuration(activeSeconds)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onToggleSide?.("left")}
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-[10px] border-[1.5px] font-bold tabular-nums transition-colors ${
            large ? "py-3 text-[13px]" : "py-2 text-[12px]"
          } ${entry.breast_active_side === "left" ? SIDE_ON : SIDE_OFF}`}
        >
          <span className="text-[10.5px] font-bold tracking-[0.04em] uppercase">Left</span>
          <span>{fmtDuration(leftSeconds)}</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleSide?.("right")}
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-[10px] border-[1.5px] font-bold tabular-nums transition-colors ${
            large ? "py-3 text-[13px]" : "py-2 text-[12px]"
          } ${entry.breast_active_side === "right" ? SIDE_ON : SIDE_OFF}`}
        >
          <span className="text-[10.5px] font-bold tracking-[0.04em] uppercase">Right</span>
          <span>{fmtDuration(rightSeconds)}</span>
        </button>
      </div>
      <button
        type="button"
        onClick={() => onEndSession?.()}
        disabled={!canEndBreastSession(entry)}
        className="w-full rounded-full border border-ink bg-ink py-2 text-[12.5px] font-bold text-paper-raised transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-transparent disabled:text-line-strong"
      >
        End Session
      </button>
    </div>
  );
}

interface BreastSessionSummaryProps {
  entry: EntryRow;
  // "expandable" — desktop: collapsed shows just the total, tap reveals
  // Right/Left/Total on three lines, tap again collapses. Tap-to-expand,
  // not hover — hover doesn't work on a touchscreen.
  // "inline" — mobile: full breakdown always shown on one line, room enough
  // to not need the collapse step at all.
  variant: "expandable" | "inline";
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export function BreastSessionSummary({
  entry,
  variant,
  expanded = false,
  onToggleExpand,
}: BreastSessionSummaryProps) {
  if (!entry.breast_session_ended || !hasBreastTime(entry)) return null;

  const right = fmtDuration(entry.breast_right_seconds);
  const left = fmtDuration(entry.breast_left_seconds);
  const total = fmtDuration(entry.breast_right_seconds + entry.breast_left_seconds);

  if (variant === "inline") {
    return (
      <div className="text-[13px] font-bold text-rose">
        🤱 Breastfed — R {right} · L {left} · Total {total}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggleExpand}
      className="rounded-[8px] border border-rose/40 bg-rose-soft px-2 py-1 text-center text-[11.5px] font-bold tabular-nums text-rose transition-colors hover:bg-rose-soft/70"
    >
      {expanded ? (
        <span className="flex flex-col leading-tight">
          <span>R {right}</span>
          <span>L {left}</span>
          <span>Σ {total}</span>
        </span>
      ) : (
        total
      )}
    </button>
  );
}
