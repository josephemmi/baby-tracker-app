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
    breast_right_seconds: 0,
    breast_left_seconds: 0,
    breast_active_side: null,
    breast_active_started_at: null,
    breast_session_ended: false,
    created_at: "2026-07-16T10:00:00.000Z",
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}
