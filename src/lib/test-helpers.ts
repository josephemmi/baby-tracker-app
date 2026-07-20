import type { EntryRow } from "@/lib/entries";

let idCounter = 0;

export function makeEntry(overrides: Partial<EntryRow>): EntryRow {
  idCounter += 1;
  return {
    id: `entry-${idCounter}`,
    baby_id: "baby-1",
    logged_by: "user-1",
    type: "feed",
    timestamp: "2026-07-16T10:00:00.000Z",
    notes: null,
    amount_ml: null,
    bottle: false,
    breast: false,
    created_at: "2026-07-16T10:00:00.000Z",
    ...overrides,
  };
}
