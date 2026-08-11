import type { EntryRow } from "@/lib/entries";
import type { BreastSide } from "@/lib/supabase/database.types";

// Shared timer math for the per-side breastfeeding timer, used by both the
// UI panel and Reports so the elapsed-time formula and its formatting live
// in exactly one place.
//
// Elapsed time is always derived from a stored start TIMESTAMP
// (breast_active_started_at), never from counting ticks. A tick-counting
// timer silently falls behind when a browser/app throttles background
// timers (iOS Safari and Android Chrome both do this aggressively) —
// timestamp math self-corrects instantly the moment it's recalculated,
// regardless of how long the app was backgrounded or how many ticks were
// actually skipped. This is also what lets every connected device compute
// a live "session in progress" display from the same synced timestamp,
// without any per-tick network writes.

export function fmtDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function getBreastDisplaySeconds(entry: EntryRow, side: BreastSide): number {
  const base = side === "right" ? entry.breast_right_seconds : entry.breast_left_seconds;
  if (entry.breast_active_side === side && entry.breast_active_started_at) {
    const elapsed = Math.floor(
      (Date.now() - new Date(entry.breast_active_started_at).getTime()) / 1000,
    );
    return base + Math.max(0, elapsed);
  }
  return base;
}

export function hasBreastTime(entry: EntryRow): boolean {
  return entry.breast_right_seconds > 0 || entry.breast_left_seconds > 0;
}

// True once there's real time to save — including a currently-running,
// not-yet-folded-in side, not just already-paused accumulated time.
export function canEndBreastSession(entry: EntryRow): boolean {
  return hasBreastTime(entry) || entry.breast_active_side !== null;
}
