import type { Database } from "@/lib/supabase/database.types";

export type EntryRow = Database["public"]["Tables"]["entries"]["Row"];

// A "moment" is the matrix UI's clustering of same-instant entries (e.g. a
// feed logged alongside a pee) back into one row, mirroring the paper log.
export interface Moment {
  key: string;
  timestamp: string;
  loggedBy: string | null;
  notes: string | null;
  feed?: EntryRow;
  pee?: EntryRow;
  poop?: EntryRow;
  // True for a row the user just created that has no entry rows in the DB
  // yet — exists only client-side until the first checkbox is ticked.
  isDraft?: boolean;
}

// A brand-new, empty row: time + logged-by prefilled, nothing else — the
// client-side stand-in for "Log a moment" until the first type is checked.
export function createDraftMoment(loggedBy: string): Moment {
  return {
    key: `draft-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    loggedBy,
    notes: null,
    isDraft: true,
  };
}

// Combines not-yet-persisted draft rows with real DB-backed moments into one
// chronologically sorted list for display.
export function mergeMoments(drafts: Moment[], real: Moment[]): Moment[] {
  return [...drafts, ...real].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp),
  );
}

// Groups same-instant entries into moments and sorts them chronologically
// (most recent event time first) — used by both Home and Timeline.
export function groupEntriesIntoMoments(entries: EntryRow[]): Moment[] {
  const moments = new Map<string, Moment>();

  for (const entry of entries) {
    const key = `${entry.timestamp}|${entry.logged_by ?? "unknown"}`;
    const moment = moments.get(key) ?? {
      key,
      timestamp: entry.timestamp,
      loggedBy: entry.logged_by,
      notes: null,
    };

    moment[entry.type] = entry;
    moment.notes = moment.notes ?? entry.notes;
    moments.set(key, moment);
  }

  return Array.from(moments.values()).sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp),
  );
}

export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function latestEntryOfType(
  entries: EntryRow[],
  type: EntryRow["type"],
): EntryRow | null {
  let latest: EntryRow | null = null;
  for (const entry of entries) {
    if (entry.type !== type) continue;
    if (!latest || entry.timestamp > latest.timestamp) latest = entry;
  }
  return latest;
}

export function formatTimeAgo(timestamp: string, now: Date): string {
  const diffMs = Math.max(0, now.getTime() - new Date(timestamp).getTime());
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return mins === 0 ? `${hours}h ago` : `${hours}h ${mins}m ago`;
}
