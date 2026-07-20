-- Splits the single "feed" concept into independent bottle/breast sub-flags
-- on the same feed-type row. Additive only — `type` and every existing row
-- are left untouched; nothing is renamed or dropped in this pass.

alter table public.entries add column bottle boolean not null default false;
alter table public.entries add column breast boolean not null default false;

-- Backfill: every existing feed was logged as a bottle feed (breastfeeding
-- wasn't trackable before this update, so breast stays false on historical rows).
update public.entries set bottle = true where type = 'feed';
