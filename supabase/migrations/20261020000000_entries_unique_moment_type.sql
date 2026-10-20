-- JOS-100: one live entry per baby, person, type and exact time.
-- A double tap on a Log box used to insert two identical rows; the app now
-- ignores the second tap, and this makes the database refuse it as well.
-- Soft-deleted rows are left out, so Recently Deleted and restore still work
-- (restoring a row whose twin is live is refused by this index).
create unique index entries_unique_live_moment_type_idx
  on public.entries (baby_id, logged_by, type, timestamp)
  where deleted_at is null;
