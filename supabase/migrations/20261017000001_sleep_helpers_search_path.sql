-- Pin the search_path of the Sleep helper functions (JOS-56), which Supabase's
-- security advisor flags as "function_search_path_mutable". They're pure
-- helpers, not callable through the API, and everything they touch is
-- schema-qualified already — this just takes the finding off the table.
-- A separate migration because 20261017000000_sleeps.sql is already applied.

alter function public.sleep_now() set search_path = public;
alter function public.sleep_ts(timestamptz) set search_path = public;
alter function public.sleep_first_start(jsonb) set search_path = public;
alter function public.sleep_last_start(jsonb) set search_path = public;
alter function public.sleep_last_end(jsonb) set search_path = public;
alter function public.sleep_state(public.sleeps, timestamptz) set search_path = public;
alter function public.sleep_reply(text, timestamptz, public.sleeps, jsonb) set search_path = public;
alter function public.sleep_conflict(public.sleeps, timestamptz) set search_path = public;
