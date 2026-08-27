import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type EntryRow = Database["public"]["Tables"]["entries"]["Row"];

// Shared between the Home page's initial server-side fetch and its
// client-side resync (on realtime reconnect) so the two never drift apart.
export const HOME_ENTRIES_LIMIT = 100;

// Shared between Timeline's server-side pagination and the Recently
// Deleted screen's restore flow, which needs to compute which page a
// restored entry will land on (JOS-20) — both must agree on the same size.
export const TIMELINE_PAGE_SIZE = 100;

// How long a soft-deleted entry stays recoverable (JOS-20). Used by every
// "active entries" query (exclude anything deleted) and the Recently
// Deleted screen's own query (include only what's still inside the window).
export const DELETED_RETENTION_DAYS = 7;

// A plain helper, not a component body, so Date.now() doesn't trip the
// "impure call during render" rule at the Server Component call sites that
// need this cutoff (Timeline's banner count, Recently Deleted's query).
export function retentionCutoffISO(): string {
  return new Date(Date.now() - DELETED_RETENTION_DAYS * 86400000).toISOString();
}

// PostgREST caps every response at the project's max-rows setting (1000 by
// default) no matter how the query is ordered. Reports needs a baby's full
// history, which routinely exceeds that — an unpaginated ascending query
// silently drops everything past row 1000, i.e. the *most recent* entries,
// which is what made Reports look permanently stuck on an old date. Page
// through in batches until a batch comes back short of a full page.
const ENTRIES_PAGE_SIZE = 1000;

export async function fetchAllEntries(
  supabase: SupabaseClient<Database>,
  babyId: string,
): Promise<EntryRow[]> {
  const all: EntryRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("entries")
      .select("*")
      .eq("baby_id", babyId)
      .is("deleted_at", null)
      .order("timestamp", { ascending: true })
      .range(offset, offset + ENTRIES_PAGE_SIZE - 1);

    if (error || !data) break;
    all.push(...data);
    if (data.length < ENTRIES_PAGE_SIZE) break;
    offset += ENTRIES_PAGE_SIZE;
  }

  return all;
}

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
  pump?: EntryRow;
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

export function formatTime(timestamp: string, timeFormat: "datetime" | "time"): string {
  return timeFormat === "time"
    ? new Date(timestamp).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : new Date(timestamp).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
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
  if (hours < 24) {
    const mins = diffMin % 60;
    return mins === 0 ? `${hours}h ago` : `${hours}h ${mins}m ago`;
  }

  // Deleted entries can sit around for up to a week (JOS-20's Recently
  // Deleted screen), well past where hour-granularity reads sensibly.
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// "N days left to restore" on the Recently Deleted screen — counts down
// from each entry's own deleted_at, independent of any other entry's
// clock. Rounds up so an entry never visibly reads "0 days left" while
// it's still inside the retention window (it simply stops appearing).
export function daysLeftToRestore(deletedAt: string, now: Date): number {
  const expiresAt = new Date(deletedAt).getTime() + DELETED_RETENTION_DAYS * 86400000;
  const msLeft = Math.max(0, expiresAt - now.getTime());
  return Math.max(1, Math.ceil(msLeft / 86400000));
}
