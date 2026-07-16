-- Broadcasts row changes on entries to subscribed clients (filtered by
-- each client's RLS-visible rows), so household members see each other's
-- logged entries live without refreshing.
alter publication supabase_realtime add table public.entries;
