-- Adds 'pump' as an independent entries.type, alongside feed/pee/poop — a
-- pump session is its own event (with or without an accompanying feed on
-- the same timestamp), not a sub-flag on an existing row. Reuses the
-- existing amount_ml column for pumped volume. Additive only — no existing
-- rows touched.

alter table public.entries drop constraint entries_type_check;
alter table public.entries add constraint entries_type_check
  check (type = any (array['feed'::text, 'pee'::text, 'poop'::text, 'pump'::text]));
