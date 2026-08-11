-- Per-side breastfeeding timer (Right/Left). Additive only — existing rows
-- and columns untouched. breast_right_seconds/breast_left_seconds hold only
-- FINALIZED accumulated seconds once a session ends; breast_active_side and
-- breast_active_started_at carry the live in-progress state (which side is
-- running and when it started) so every connected device can compute the
-- current elapsed time itself via accumulated + (now - started_at), instead
-- of a per-tick counter that would need constant writes to stay in sync.

alter table public.entries add column breast_right_seconds integer not null default 0;
alter table public.entries add column breast_left_seconds integer not null default 0;
alter table public.entries add column breast_active_side text;
alter table public.entries add column breast_active_started_at timestamptz;
alter table public.entries add column breast_session_ended boolean not null default false;

alter table public.entries add constraint entries_breast_active_side_check
  check (breast_active_side is null or breast_active_side = any (array['right'::text, 'left'::text]));
