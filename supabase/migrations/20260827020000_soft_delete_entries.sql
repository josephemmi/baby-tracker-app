-- Soft-delete entries: 7-day recovery window (JOS-20).
-- Additive only — no destructive migration, no data touched.
alter table public.entries
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.users (id) on delete set null;

-- Speeds both the "active entries" filter (deleted_at is null) added to
-- every existing query, and the Recently Deleted screen's own query
-- (deleted_at is not null and deleted_at > now() - interval '7 days').
create index entries_baby_id_deleted_at_idx on public.entries (baby_id, deleted_at);
