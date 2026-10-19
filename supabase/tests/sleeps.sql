-- Checks for the sleeps migration (JOS-56): the rules the app relies on the
-- DATABASE to enforce — first write wins, server-clock actions, one open sleep
-- per baby, auto-close, soft delete, and who can touch what.
--
-- How to run: against a SCRATCH database that has every migration applied
-- (a Supabase branch, or a local Postgres with stand-ins for auth.uid(), the
-- anon/authenticated roles and the supabase_realtime publication):
--
--   psql "$SCRATCH_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sleeps.sql
--
-- It runs in one transaction and rolls back, and nothing it creates survives —
-- but it replaces public.sleep_now() with a controllable clock for its
-- duration, so don't point it at a database people are using. Any failed
-- `assert` aborts the run with the scenario named in the message.
-- The same scenarios are unit-tested in TypeScript in src/lib/sleep.test.ts.

begin;

create or replace function public.sleep_now()
returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('test.now', true), '')::timestamptz,
                  date_trunc('milliseconds', now()));
$$;

-- Acting as a user at a moment in time.
create function public.t_as(u uuid, at timestamptz default null)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  if at is not null then perform set_config('test.now', at::text, true); end if;
end $$;

-- Fixtures: Joseph and Jen share a household and a baby; a stranger has another.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b1');
insert into public.households (id, name) values
  ('00000000-0000-0000-0000-0000000000c1', 'Emmi'),
  ('00000000-0000-0000-0000-0000000000c2', 'Other');
insert into public.users (id, household_id, name) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'Joseph'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c1', 'Jen'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c2', 'Stranger');
insert into public.babies (id, household_id, name, date_of_birth) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'Baby', '2026-07-01'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', 'Other baby', '2026-07-01');

set local role authenticated;

-- 1. Start: server clock, rev 1, one open stretch, who/what/when recorded ------
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  t0 constant timestamptz := '2026-10-16 17:20:00+00';
  r jsonb; s jsonb;
begin
  perform public.t_as(j, t0);
  r := public.start_sleep(baby);
  assert r ->> 'status' = 'ok', '1 start ok: ' || r::text;
  assert r ->> 'now' = '2026-10-16T17:20:00.000Z', '1 reply carries the server clock: ' || r::text;
  s := r -> 'sleep';
  assert (s ->> 'rev')::int = 1, '1 rev starts at 1';
  assert s ->> 'closed_at' is null, '1 open';
  assert (s ->> 'logged_by')::uuid = j and (s ->> 'last_by')::uuid = j, '1 who started it';
  assert s ->> 'last_action' = 'start' and (s ->> 'last_at')::timestamptz = t0, '1 last action';
  assert s -> 'segments' = '[{"start": "2026-10-16T17:20:00.000Z", "end": null}]'::jsonb, '1 one open stretch: ' || (s -> 'segments')::text;
  assert (s ->> 'started_at')::timestamptz = t0, '1 started_at kept in step';
end $$;

-- 2. One open sleep per baby; the other parent is told, not duplicated --------
do $$
declare
  n constant uuid := '00000000-0000-0000-0000-0000000000a2';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  r jsonb;
begin
  perform public.t_as(n, '2026-10-16 17:25:00+00');
  r := public.start_sleep(baby);
  assert r ->> 'status' = 'open_exists', '2 second start is refused: ' || r::text;
  assert r -> 'sleep' ->> 'last_by' = '00000000-0000-0000-0000-0000000000a1', '2 and names who started it';
  assert (select count(*) from public.sleeps) = 1, '2 still exactly one sleep';
end $$;

-- 3. Pause needs a minute of sleep ---------------------------------------------
do $$
declare
  n constant uuid := '00000000-0000-0000-0000-0000000000a2';
  t0 constant timestamptz := '2026-10-16 17:20:00+00';
  id uuid := (select s.id from public.sleeps s);
  r jsonb;
begin
  perform public.t_as(n, t0 + interval '59.999 seconds');
  r := public.pause_sleep(id, 1);
  assert r ->> 'status' = 'error' and r ->> 'code' = 'short', '3 pause under a minute is refused: ' || r::text;
  assert (select rev from public.sleeps) = 1, '3 and nothing changed';

  perform public.t_as(n, t0 + interval '1 minute');
  r := public.pause_sleep(id, 1);
  assert r ->> 'status' = 'ok', '3 pause at exactly a minute: ' || r::text;
  assert (r -> 'sleep' ->> 'rev')::int = 2, '3 rev bumps';
  assert r -> 'sleep' ->> 'last_action' = 'pause' and (r -> 'sleep' ->> 'last_by')::uuid = n, '3 records Jen';
  assert r -> 'sleep' -> 'segments' -> 0 ->> 'end' = '2026-10-16T17:21:00.000Z', '3 stretch ends at the server clock';
end $$;

-- 4. First write wins: Joseph's stale Pause loses to Jen's ---------------------
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  id uuid := (select s.id from public.sleeps s);
  r jsonb;
begin
  perform public.t_as(j, '2026-10-16 17:22:00+00');
  r := public.pause_sleep(id, 1);
  assert r ->> 'status' = 'conflict' and r ->> 'reason' = 'stale', '4 stale pause is a conflict: ' || r::text;
  assert r -> 'sleep' ->> 'last_action' = 'pause'
     and (r -> 'sleep' ->> 'last_by')::uuid = '00000000-0000-0000-0000-0000000000a2'
     and (r -> 'sleep' ->> 'last_at')::timestamptz = '2026-10-16 17:21:00+00',
     '4 the reply says who paused it and when: ' || r::text;
  assert (select rev from public.sleeps) = 2, '4 and the sleep is untouched';
end $$;

-- 4b. The state matches again, the rev does not: the stale action still loses ---
reset role;
delete from public.sleeps;
set local role authenticated;

do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  n constant uuid := '00000000-0000-0000-0000-0000000000a2';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  t0 constant timestamptz := '2026-10-16 17:20:00+00';
  id uuid; r jsonb;
begin
  perform public.t_as(j, t0);
  id := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;      -- rev 1, Joseph is looking at this
  perform public.t_as(n, t0 + interval '2 minutes');
  perform public.pause_sleep(id, 1);                                -- rev 2
  perform public.t_as(n, t0 + interval '3 minutes');
  perform public.resume_sleep(id, 2);                               -- rev 3, asleep again
  perform public.t_as(j, t0 + interval '5 minutes');
  r := public.pause_sleep(id, 1);
  assert r ->> 'status' = 'conflict' and r ->> 'reason' = 'stale',
    '4b asleep again, but not the sleep Joseph was looking at: ' || r::text;
  assert r -> 'sleep' ->> 'last_action' = 'resume', '4b says what Jen did last: ' || r::text;
  assert (select rev from public.sleeps) = 3, '4b and changed nothing';
  r := public.stop_sleep(id, 1);
  assert r ->> 'status' = 'conflict', '4b the same for Stop: ' || r::text;
end $$;

reset role;
delete from public.sleeps;
set local role authenticated;

-- (5 onwards need the sleep from scenario 1-4 back: start it again)
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  n constant uuid := '00000000-0000-0000-0000-0000000000a2';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  t0 constant timestamptz := '2026-10-16 17:20:00+00';
  id uuid;
begin
  perform public.t_as(j, t0);
  id := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(n, t0 + interval '1 minute');
  perform public.pause_sleep(id, 1);                                -- rev 2, paused
end $$;

-- 5. Resume appends a stretch; a stale resume loses -------------------------------
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  id uuid := (select s.id from public.sleeps s);
  r jsonb;
begin
  perform public.t_as(j, '2026-10-16 17:30:00+00');
  r := public.resume_sleep(id, 2);
  assert r ->> 'status' = 'ok', '5 resume ok: ' || r::text;
  assert jsonb_array_length(r -> 'sleep' -> 'segments') = 2, '5 a second stretch';
  assert r -> 'sleep' -> 'segments' -> 1 ->> 'start' = '2026-10-16T17:30:00.000Z', '5 starts at the server clock';
  r := public.resume_sleep(id, 2);
  assert r ->> 'status' = 'conflict', '5 resuming again on the old rev: ' || r::text;
  r := public.resume_sleep(id, 3);
  assert r ->> 'status' = 'conflict', '5 resuming something already running: ' || r::text;
end $$;

-- 6. Stop works at any time; Stop on a paused sleep closes at the last wake -------
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  id uuid := (select s.id from public.sleeps s);
  r jsonb;
begin
  perform public.t_as(j, '2026-10-16 17:30:01+00');
  r := public.stop_sleep(id, 3);
  assert r ->> 'status' = 'ok', '6 stop a second into a stretch: ' || r::text;
  assert (r -> 'sleep' ->> 'closed_at')::timestamptz = '2026-10-16 17:30:01+00', '6 closed at the server clock';
  assert r -> 'sleep' -> 'segments' -> 1 ->> 'end' = '2026-10-16T17:30:01.000Z', '6 and the stretch ends there';
  r := public.stop_sleep(id, 4);
  assert r ->> 'status' = 'conflict', '6 stopping a finished sleep: ' || r::text;
end $$;

reset role;
delete from public.sleeps;
set local role authenticated;

do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  t0 constant timestamptz := '2026-10-16 17:20:00+00';
  id uuid; r jsonb;
begin
  perform public.t_as(j, t0);
  id := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;
  perform public.pause_sleep(id, 1) ; -- too soon, ignored
  perform public.t_as(j, t0 + interval '40 minutes');
  perform public.pause_sleep(id, 1);
  perform public.t_as(j, t0 + interval '70 minutes');
  r := public.stop_sleep(id, 2);
  assert r ->> 'status' = 'ok', '6b stop while paused: ' || r::text;
  assert (r -> 'sleep' ->> 'closed_at')::timestamptz = t0 + interval '40 minutes',
    '6b closes at the last wake, not at the tap: ' || r::text;
  assert (r -> 'sleep' ->> 'last_at')::timestamptz = t0 + interval '40 minutes', '6b';
end $$;

-- 7. Reopen: within 3 h of the last wake, no newer sleep, never after auto-close --
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  t0 constant timestamptz := '2026-10-16 17:20:00+00';
  id uuid := (select s.id from public.sleeps s);
  r jsonb;
begin
  -- closed at t0 + 40 min
  perform public.t_as(j, t0 + interval '70 minutes');
  r := public.reopen_sleep(id, 99);
  assert r ->> 'status' = 'conflict', '7 reopen on a stale rev: ' || r::text;

  perform public.t_as(j, t0 + interval '40 minutes' + interval '3 hours 1 second');
  r := public.reopen_sleep(id, 3);
  assert r ->> 'code' = 'no-reopen' and r ->> 'reason' = 'expired', '7 after 3 h: ' || r::text;

  perform public.t_as(j, t0 + interval '40 minutes' + interval '3 hours');
  r := public.reopen_sleep(id, 3);
  assert r ->> 'status' = 'ok', '7 exactly 3 h after the last wake: ' || r::text;
  assert r -> 'sleep' ->> 'closed_at' is null, '7 open again';
  assert r -> 'sleep' -> 'segments' -> 0 ->> 'end' = '2026-10-16T18:00:00.000Z', '7 last wake kept';
  assert r -> 'sleep' ->> 'last_action' = 'reopen', '7';
  -- and it is the baby's open sleep again, so nobody can start another
  r := public.start_sleep(baby);
  assert r ->> 'status' = 'open_exists', '7 reopened sleep blocks a new start: ' || r::text;
end $$;

-- 8. A newer sleep blocks reopening the older one ------------------------------
reset role;
delete from public.sleeps;
set local role authenticated;

do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  t0 constant timestamptz := '2026-10-16 10:00:00+00';
  a uuid; b uuid; r jsonb;
begin
  perform public.t_as(j, t0);
  a := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(j, t0 + interval '30 minutes');
  perform public.stop_sleep(a, 1);
  perform public.t_as(j, t0 + interval '40 minutes');
  b := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(j, t0 + interval '50 minutes');
  perform public.stop_sleep(b, 1);

  r := public.reopen_sleep(a, 2);
  assert r ->> 'code' = 'no-reopen' and r ->> 'reason' = 'newer', '8 newer sleep exists: ' || r::text;
  r := public.reopen_sleep(b, 2);
  assert r ->> 'status' = 'ok', '8 the newest can be reopened: ' || r::text;
end $$;

-- 9. Auto-close: 3 h paused; derived on read, written when the next sleep starts --
reset role;
delete from public.sleeps;
set local role authenticated;

do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  t0 constant timestamptz := '2026-10-16 10:00:00+00';
  a uuid; r jsonb;
begin
  perform public.t_as(j, t0);
  a := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(j, t0 + interval '30 minutes');
  perform public.pause_sleep(a, 1);            -- paused from 10:30

  -- 3 h later, exactly: still paused
  perform public.t_as(j, t0 + interval '30 minutes' + interval '3 hours');
  r := public.resume_sleep(a, 2);
  assert r ->> 'status' = 'ok', '9 resume at exactly 3 h: ' || r::text;
  perform public.pause_sleep(a, 3);            -- no effect, too soon (< 1 min)
  r := public.stop_sleep(a, 3);
  assert r ->> 'status' = 'ok', '9 stop: ' || r::text;
end $$;

reset role;
delete from public.sleeps;
set local role authenticated;

do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  n constant uuid := '00000000-0000-0000-0000-0000000000a2';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  t0 constant timestamptz := '2026-10-16 10:00:00+00';
  a uuid; b uuid; r jsonb;
begin
  perform public.t_as(j, t0);
  a := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(j, t0 + interval '30 minutes');
  perform public.pause_sleep(a, 1);            -- last wake 10:30

  -- 3 h 1 s after the wake it has closed itself (but nothing is written yet)
  perform public.t_as(n, t0 + interval '30 minutes' + interval '3 hours 1 second');
  assert (select closed_at from public.sleeps where id = a) is null, '9 not written until read as stale';
  r := public.resume_sleep(a, 2);
  assert r ->> 'status' = 'conflict' and r ->> 'reason' = 'autoclosed', '9 resume on an auto-closed sleep: ' || r::text;
  r := public.stop_sleep(a, 2);
  assert r ->> 'reason' = 'autoclosed', '9 stop on an auto-closed sleep: ' || r::text;
  r := public.reopen_sleep(a, 2);
  assert r ->> 'code' = 'no-reopen' and r ->> 'reason' = 'autoclosed', '9 never reopened: ' || r::text;
  r := public.set_sleep_time(a, 2, 'start', null, 5);
  assert r ->> 'reason' = 'autoclosed', '9 and can not be edited: ' || r::text;

  -- starting the next sleep closes it first, in the same transaction
  r := public.start_sleep(baby);
  assert r ->> 'status' = 'ok', '9 a new sleep can start: ' || r::text;
  b := (r -> 'sleep' ->> 'id')::uuid;
  assert (select closed_at from public.sleeps where id = a) = t0 + interval '30 minutes',
    '9 the old one is closed at its last wake, not at the new start';
  assert (select rev from public.sleeps where id = a) = 2, '9 closing it does not count as a change';
  assert (select count(*) from public.sleeps where closed_at is null) = 1, '9 exactly one open sleep';
end $$;

-- 10. Picking a start or wake time ---------------------------------------------
reset role;
delete from public.sleeps;
set local role authenticated;

do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  t0 constant timestamptz := '2026-10-16 10:00:00+00';
  a uuid; b uuid; r jsonb;
begin
  -- an earlier, finished sleep 09:00-09:40
  perform public.t_as(j, t0 - interval '60 minutes');
  a := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(j, t0 - interval '20 minutes');
  perform public.stop_sleep(a, 1);

  perform public.t_as(j, t0);
  b := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(j, t0 + interval '30 minutes');

  r := public.set_sleep_time(b, 1, 'start', null, 15);
  assert r ->> 'status' = 'ok', '10 started 15 min earlier: ' || r::text;
  assert r -> 'sleep' -> 'segments' -> 0 ->> 'start' = '2026-10-16T10:15:00.000Z', '10 minutes ago come from the server clock: ' || r::text;
  assert r -> 'sleep' ->> 'last_action' = 'edit', '10';

  r := public.set_sleep_time(b, 2, 'start', t0 - interval '21 minutes' + interval '0 seconds', null);
  assert r ->> 'code' = 'before-prev' and r ->> 'limit' = '2026-10-16T09:40:00.000Z', '10 before the previous wake: ' || r::text;
  r := public.set_sleep_time(b, 2, 'start', t0 - interval '20 minutes', null);
  assert r ->> 'status' = 'ok', '10 exactly at the previous wake is fine: ' || r::text;

  r := public.set_sleep_time(b, 3, 'start', t0 + interval '31 minutes', null);
  assert r ->> 'code' = 'future', '10 a start in the future: ' || r::text;
  r := public.set_sleep_time(b, 3, 'end', null, 5);
  assert r ->> 'status' = 'conflict', '10 no wake time while still asleep: ' || r::text;
  begin
    perform public.set_sleep_time(b, 3, 'start', null, null);
    assert false, '10 needs a time';
  exception when others then
    assert sqlerrm like 'Give either%', '10 needs a time: ' || sqlerrm;
  end;
  begin
    perform public.set_sleep_time(b, 3, 'start', now(), 5);
    assert false, '10 not both';
  exception when others then
    assert sqlerrm like 'Give either%', '10 not both: ' || sqlerrm;
  end;

  -- pause at 10:30, then move the wake time
  r := public.pause_sleep(b, 3);
  assert r ->> 'status' = 'ok', '10 pause: ' || r::text;
  r := public.set_sleep_time(b, 4, 'start', t0 + interval '29 minutes 30 seconds', null);
  assert r ->> 'code' = 'after-end', '10 start must stay a minute before the wake: ' || r::text;
  r := public.set_sleep_time(b, 4, 'end', t0 - interval '19 minutes 30 seconds', null);
  assert r ->> 'code' = 'before-start', '10 wake before the stretch began: ' || r::text;
  r := public.set_sleep_time(b, 4, 'end', t0 + interval '20 minutes', null);
  assert r ->> 'status' = 'ok', '10 woke earlier: ' || r::text;
  assert r -> 'sleep' -> 'segments' -> 0 ->> 'end' = '2026-10-16T10:20:00.000Z', '10';
end $$;

-- 11. Delete is soft, closes what is open, and restore refuses an overlap --------
reset role;
delete from public.sleeps;
set local role authenticated;

do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  n constant uuid := '00000000-0000-0000-0000-0000000000a2';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  t0 constant timestamptz := '2026-10-16 10:00:00+00';
  a uuid; b uuid; r jsonb;
begin
  perform public.t_as(j, t0);
  a := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;

  -- Discard a running sleep: stale rev loses, current rev soft-deletes
  perform public.t_as(n, t0 + interval '20 seconds');
  r := public.delete_sleep(a, 7);
  assert r ->> 'status' = 'conflict', '11 stale delete: ' || r::text;
  r := public.delete_sleep(a, 1);
  assert r ->> 'status' = 'ok', '11 delete: ' || r::text;
  assert r -> 'sleep' ->> 'deleted_at' is not null and (r -> 'sleep' ->> 'deleted_by')::uuid = n, '11 soft deleted by Jen';
  assert (r -> 'sleep' ->> 'closed_at')::timestamptz = t0 + interval '20 seconds', '11 a running sleep ends where it was deleted';
  assert (select count(*) from public.sleeps where id = a) = 1, '11 the row is still there';
  assert (public.get_sleeps(baby, t0 - interval '1 day') -> 'sleeps') = '[]'::jsonb, '11 but gone from the Log';
  r := public.pause_sleep(a, 2);
  assert r ->> 'status' = 'gone', '11 acting on a deleted sleep: ' || r::text;
  r := public.delete_sleep(a, 2);
  assert r ->> 'status' = 'gone', '11 deleting twice: ' || r::text;

  -- the baby can sleep again; its slot is free
  perform public.t_as(j, t0 + interval '1 hour');
  r := public.start_sleep(baby);
  assert r ->> 'status' = 'ok', '11 start after a discard: ' || r::text;
  b := (r -> 'sleep' ->> 'id')::uuid;

  -- Restore a at 10:00:00-10:00:20, no overlap
  r := public.restore_sleep(a);
  assert r ->> 'status' = 'ok', '11 restore: ' || r::text;
  assert r -> 'sleep' ->> 'deleted_at' is null and r -> 'sleep' ->> 'closed_at' is not null, '11 restored as a finished sleep';
  r := public.restore_sleep(a);
  assert r ->> 'status' = 'gone', '11 restoring what is not deleted: ' || r::text;

  -- delete both, move b to overlap a, then restore a
  perform public.delete_sleep(a, 3);
  r := public.set_sleep_time(b, 1, 'start', t0 + interval '10 seconds', null);
  assert r ->> 'status' = 'ok', '11 b started "earlier", over a: ' || r::text;
  r := public.restore_sleep(a);
  assert r ->> 'status' = 'error' and r ->> 'code' = 'overlap', '11 restore would overlap: ' || r::text;
  assert r -> 'other' ->> 'id' = b::text, '11 and names the sleep in the way';
  assert (select deleted_at from public.sleeps where id = a) is not null, '11 still deleted';

  -- 7 days
  perform public.t_as(j, t0 + interval '7 days 1 hour');
  perform public.delete_sleep(b, 2);
  r := public.restore_sleep(a);
  assert r ->> 'status' = 'gone', '11 past the 7-day window: ' || r::text;
end $$;

-- 12. Pausing/deleting a PAUSED sleep closes it at its last wake ------------------
reset role;
delete from public.sleeps;
set local role authenticated;

do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  t0 constant timestamptz := '2026-10-16 10:00:00+00';
  a uuid; r jsonb;
begin
  perform public.t_as(j, t0);
  a := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(j, t0 + interval '10 minutes');
  perform public.pause_sleep(a, 1);
  perform public.t_as(j, t0 + interval '50 minutes');
  r := public.delete_sleep(a, 2);
  assert (r -> 'sleep' ->> 'closed_at')::timestamptz = t0 + interval '10 minutes', '12 deleted while paused closes at the wake: ' || r::text;
end $$;

-- 13. Who can touch what ----------------------------------------------------------
reset role;
delete from public.sleeps;
set local role authenticated;

do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  x constant uuid := '00000000-0000-0000-0000-0000000000b1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  t0 constant timestamptz := '2026-10-16 10:00:00+00';
  a uuid; r jsonb; rows int;
begin
  perform public.t_as(j, t0);
  a := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;

  -- a stranger sees nothing and can do nothing
  perform public.t_as(x);
  assert (select count(*) from public.sleeps) = 0, '13 RLS hides the sleep from another household';
  begin perform public.start_sleep(baby); assert false, '13 start'; exception when others then
    assert sqlerrm = 'Not allowed', '13 start: ' || sqlerrm; end;
  begin perform public.get_sleeps(baby, t0); assert false, '13 get'; exception when others then
    assert sqlerrm = 'Not allowed', '13 get: ' || sqlerrm; end;
  begin perform public.pause_sleep(a, 1); assert false, '13 pause'; exception when others then
    assert sqlerrm = 'Not allowed', '13 pause: ' || sqlerrm; end;
  begin perform public.delete_sleep(a, 1); assert false, '13 delete'; exception when others then
    assert sqlerrm = 'Not allowed', '13 delete: ' || sqlerrm; end;
  update public.sleeps set notes = 'hacked';
  get diagnostics rows = row_count;
  assert rows = 0, '13 a stranger can not even update notes';

  -- a member may edit the note and the who-pill, and neither counts as a change
  perform public.t_as(j);
  -- Forget every cached plan first: the trigger these edits fire must work
  -- when a connection's very FIRST run of it is as a member. (A plan cached by
  -- an earlier run as the table owner would hide a missing privilege.)
  discard plans;
  update public.sleeps set notes = 'fed and changed first' where id = a;
  assert (select notes from public.sleeps where id = a) = 'fed and changed first', '13 note saved';
  assert (select rev from public.sleeps where id = a) = 1, '13 a note does not bump rev';
  update public.sleeps set logged_by = '00000000-0000-0000-0000-0000000000a2' where id = a;
  assert (select logged_by from public.sleeps where id = a) = '00000000-0000-0000-0000-0000000000a2', '13 who-pill';
  begin
    update public.sleeps set logged_by = x where id = a;
    assert false, '13 who-pill across households';
  exception when others then
    assert sqlerrm = 'That person is not in this household.', '13 who-pill: ' || sqlerrm;
  end;

  -- but not the state
  begin update public.sleeps set segments = '[]' where id = a; assert false, '13 segments';
  exception when insufficient_privilege then null; end;
  begin update public.sleeps set closed_at = now() where id = a; assert false, '13 closed_at';
  exception when insufficient_privilege then null; end;
  begin update public.sleeps set rev = 99 where id = a; assert false, '13 rev';
  exception when insufficient_privilege then null; end;
  begin delete from public.sleeps where id = a; assert false, '13 delete row';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.sleeps (baby_id, segments, last_action, last_at)
    values (baby, '[{"start": "2026-10-16T09:00:00.000Z", "end": null}]', 'start', now());
    assert false, '13 insert';
  exception when insufficient_privilege then null; end;
end $$;

-- 14. The table keeps itself honest even for the owner --------------------------
reset role;

do $$
declare
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  a uuid := (select s.id from public.sleeps s);
begin
  begin
    insert into public.sleeps (baby_id, segments, last_action, last_at)
    values (baby, '[{"start": "2026-10-16T09:00:00.000Z", "end": null}]', 'start', now());
    assert false, '14 two open sleeps';
  exception when unique_violation then null; end;

  begin
    update public.sleeps set closed_at = '2026-10-16T11:00:00Z' where id = a;
    assert false, '14 closed_at must equal the last end';
  exception when others then
    assert sqlerrm like 'A closed sleep must end%', '14: ' || sqlerrm; end;

  begin
    update public.sleeps set segments =
      '[{"start": "2026-10-16T09:00:00.000Z", "end": "2026-10-16T09:30:00.000Z"}, {"start": "2026-10-16T09:10:00.000Z", "end": null}]'
    where id = a;
    assert false, '14 stretches out of order';
  exception when others then
    assert sqlerrm like 'Stretch 2 starts before stretch 1 ends%', '14: ' || sqlerrm; end;

  begin
    update public.sleeps set segments =
      '[{"start": "2026-10-16T09:00:00.000Z", "end": null}, {"start": "2026-10-16T09:10:00.000Z", "end": null}]'
    where id = a;
    assert false, '14 only the last can be open';
  exception when others then
    assert sqlerrm like 'Only the last stretch%', '14: ' || sqlerrm; end;

  begin
    update public.sleeps set segments = '[]' where id = a;
    assert false, '14 at least one stretch';
  exception when others then
    assert sqlerrm like 'A sleep needs at least one stretch%', '14: ' || sqlerrm; end;
end $$;

-- 15. Signed-out callers can not reach any of it --------------------------------
set local role anon;
do $$
begin
  begin
    perform public.start_sleep('00000000-0000-0000-0000-0000000000d1');
    assert false, '15 anon start';
  exception when insufficient_privilege then null; end;
  begin
    perform public.get_sleeps('00000000-0000-0000-0000-0000000000d1', now());
    assert false, '15 anon get';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 16. The helpers are not part of the API ---------------------------------------
set local role authenticated;
do $$
begin
  begin perform public.sleep_lock(gen_random_uuid()); assert false, '16 sleep_lock';
  exception when insufficient_privilege then null; end;
  begin perform public.sleep_now(); assert false, '16 sleep_now';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 17. Remove a pause (JOS-78): while the sleep is running or paused, never once it is
--     finished (Reopen first), and the time adds up --------------------------------
reset role;
delete from public.sleeps;
set local role authenticated;

-- 17a. The night from the screenshot: 21:00-21:06, 21:08-02:10, 02:43-08:34, then
--      finished. A finished sleep refuses; Reopen, then remove both pauses; Stop.
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  n constant uuid := '00000000-0000-0000-0000-0000000000a2';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  sid uuid; r jsonb; s jsonb;
begin
  perform public.t_as(j, '2026-10-16 21:00:00+00');
  r := public.start_sleep(baby);  sid := (r -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(n, '2026-10-16 21:06:00+00'); r := public.pause_sleep(sid, 1);
  perform public.t_as(n, '2026-10-16 21:08:00+00'); r := public.resume_sleep(sid, 2);
  perform public.t_as(n, '2026-10-17 02:10:00+00'); r := public.pause_sleep(sid, 3);
  perform public.t_as(n, '2026-10-17 02:43:00+00'); r := public.resume_sleep(sid, 4);
  perform public.t_as(j, '2026-10-17 08:34:00+00'); r := public.stop_sleep(sid, 5);
  s := r -> 'sleep';
  assert (s ->> 'rev')::int = 6 and s ->> 'closed_at' is not null and jsonb_array_length(s -> 'segments') = 3,
         '17a night is finished with 3 stretches: ' || r::text;

  -- finished: read-only, even with the right rev
  perform public.t_as(n, '2026-10-17 08:40:00+00');
  r := public.remove_sleep_pause(sid, 6, 0);
  assert r ->> 'status' = 'conflict' and r ->> 'reason' = 'stale', '17a a finished sleep refuses: ' || r::text;
  assert (select rev from public.sleeps where sleeps.id = sid) = 6, '17a and nothing changed';

  -- Reopen sleep (JOS-56): back to paused, last wake kept
  r := public.reopen_sleep(sid, 6);
  assert r ->> 'status' = 'ok' and (r -> 'sleep' ->> 'rev')::int = 7 and r -> 'sleep' ->> 'closed_at' is null, '17a reopened: ' || r::text;

  -- stale rev: the screen is one change behind
  r := public.remove_sleep_pause(sid, 6, 0);
  assert r ->> 'status' = 'conflict' and r ->> 'reason' = 'stale', '17a stale rev is a conflict: ' || r::text;

  -- a pause that is not there
  r := public.remove_sleep_pause(sid, 7, 2);
  assert r ->> 'status' = 'error' and r ->> 'code' = 'no-pause', '17a index past the last pause: ' || r::text;
  r := public.remove_sleep_pause(sid, 7, -1);
  assert r ->> 'status' = 'error' and r ->> 'code' = 'no-pause', '17a negative index: ' || r::text;
  r := public.remove_sleep_pause(sid, 7, null);
  assert r ->> 'status' = 'error' and r ->> 'code' = 'no-pause', '17a null index: ' || r::text;
  assert (select rev from public.sleeps where sleeps.id = sid) = 7, '17a refusals change nothing';

  -- remove the first (2 min) pause, as Jen
  perform public.t_as(n, '2026-10-17 08:41:00+00');
  r := public.remove_sleep_pause(sid, 7, 0);
  assert r ->> 'status' = 'ok', '17a remove first pause: ' || r::text;
  s := r -> 'sleep';
  assert s -> 'segments' = '[{"start": "2026-10-16T21:00:00.000Z", "end": "2026-10-17T02:10:00.000Z"},
                            {"start": "2026-10-17T02:43:00.000Z", "end": "2026-10-17T08:34:00.000Z"}]'::jsonb,
         '17a stretches merged, the 33 min pause stays: ' || (s -> 'segments')::text;
  assert (s ->> 'rev')::int = 8, '17a rev bumps';
  assert s ->> 'last_action' = 'edit' and (s ->> 'last_by')::uuid = n, '17a recorded as Jen editing';
  assert (s ->> 'started_at')::timestamptz = '2026-10-16 21:00:00+00', '17a start unchanged';
  assert s ->> 'closed_at' is null, '17a still reopened (paused)';

  -- repeating the same call is a conflict, not a second removal
  r := public.remove_sleep_pause(sid, 7, 0);
  assert r ->> 'status' = 'conflict', '17a repeat is a conflict: ' || r::text;

  -- remove the last remaining pause, as Joseph: one stretch, no pauses
  perform public.t_as(j, '2026-10-17 08:42:00+00');
  r := public.remove_sleep_pause(sid, 8, 0);
  assert r ->> 'status' = 'ok', '17a remove last pause: ' || r::text;
  assert r -> 'sleep' -> 'segments' = '[{"start": "2026-10-16T21:00:00.000Z", "end": "2026-10-17T08:34:00.000Z"}]'::jsonb,
         '17a one stretch left: ' || (r -> 'sleep' -> 'segments')::text;
  assert (r -> 'sleep' ->> 'last_by')::uuid = j, '17a recorded as Joseph editing';
  r := public.remove_sleep_pause(sid, 9, 0);
  assert r ->> 'status' = 'error' and r ->> 'code' = 'no-pause', '17a nothing left to remove: ' || r::text;

  -- Stop closes it at the last wake again; wake time did not move
  perform public.t_as(j, '2026-10-17 08:50:00+00');
  r := public.stop_sleep(sid, 9);
  assert r ->> 'status' = 'ok' and (r -> 'sleep' ->> 'closed_at')::timestamptz = '2026-10-17 08:34:00+00', '17a stopped at the last wake: ' || r::text;
  r := public.remove_sleep_pause(sid, 10, 0);
  assert r ->> 'status' = 'conflict', '17a finished again, read-only again: ' || r::text;
end $$;

-- 17b. A RUNNING sleep: the open last stretch survives the merge and keeps running.
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  sid uuid; r jsonb; s jsonb;
begin
  perform public.t_as(j, '2026-10-17 10:00:00+00');
  r := public.start_sleep(baby);  sid := (r -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(j, '2026-10-17 10:30:00+00'); r := public.pause_sleep(sid, 1);
  perform public.t_as(j, '2026-10-17 10:40:00+00'); r := public.resume_sleep(sid, 2);
  assert (select x.closed_at is null and x.segments -> -1 ->> 'end' is null from public.sleeps x where x.id = sid), '17b running';
  r := public.remove_sleep_pause(sid, 3, 0);
  assert r ->> 'status' = 'ok', '17b remove while running: ' || r::text;
  s := r -> 'sleep';
  assert s -> 'segments' = '[{"start": "2026-10-17T10:00:00.000Z", "end": null}]'::jsonb, '17b one open stretch: ' || (s -> 'segments')::text;
  assert s ->> 'closed_at' is null, '17b still open';
  perform public.t_as(j, '2026-10-17 10:45:00+00');
  r := public.pause_sleep(sid, 4);
  assert r ->> 'status' = 'ok', '17b can pause again after: ' || r::text;
  -- paused now: the pause in progress is not removable (there is only one stretch)
  r := public.remove_sleep_pause(sid, 5, 0);
  assert r ->> 'status' = 'error' and r ->> 'code' = 'no-pause', '17b the open pause is not removable: ' || r::text;
  r := public.stop_sleep(sid, 5);
  assert r ->> 'status' = 'ok', '17b stop';
end $$;

-- 17c. A PAUSED sleep with an earlier completed pause: remove it, the sleep stays paused.
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  sid uuid; r jsonb; s jsonb;
begin
  perform public.t_as(j, '2026-10-17 12:00:00+00');
  r := public.start_sleep(baby);  sid := (r -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(j, '2026-10-17 12:10:00+00'); r := public.pause_sleep(sid, 1);
  perform public.t_as(j, '2026-10-17 12:18:00+00'); r := public.resume_sleep(sid, 2);
  perform public.t_as(j, '2026-10-17 12:40:00+00'); r := public.pause_sleep(sid, 3);
  perform public.t_as(j, '2026-10-17 12:52:00+00');
  r := public.remove_sleep_pause(sid, 4, 0);
  assert r ->> 'status' = 'ok', '17c remove the 8 min pause: ' || r::text;
  s := r -> 'sleep';
  assert s -> 'segments' = '[{"start": "2026-10-17T12:00:00.000Z", "end": "2026-10-17T12:40:00.000Z"}]'::jsonb,
         '17c one stretch; the pause in progress is not touched: ' || (s -> 'segments')::text;
  assert s ->> 'closed_at' is null and s -> 'segments' -> -1 ->> 'end' is not null, '17c still paused';
  r := public.resume_sleep(sid, 5);
  assert r ->> 'status' = 'ok', '17c and it can resume: ' || r::text;
  r := public.stop_sleep(sid, 6);
end $$;

-- 17d. Another sleep inside the pause: removing would overlap it, so it is refused.
--      (No app flow creates this today; the guard keeps a future "add a past sleep"
--      from being able to.) Both sleeps are forged as the table owner.
reset role;
do $$
declare
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  sid uuid; r jsonb;
begin
  insert into public.sleeps (baby_id, segments, started_at, closed_at, rev, last_by, last_action, last_at)
  values (baby,
          '[{"start": "2026-10-18T01:00:00.000Z", "end": "2026-10-18T01:20:00.000Z"},
            {"start": "2026-10-18T02:00:00.000Z", "end": "2026-10-18T03:00:00.000Z"}]',
          '2026-10-18 01:00:00+00', null, 7, j, 'pause', '2026-10-18 03:00:00+00')
  returning sleeps.id into sid;
  insert into public.sleeps (baby_id, segments, started_at, closed_at, rev, last_by, last_action, last_at)
  values (baby,
          '[{"start": "2026-10-18T01:30:00.000Z", "end": "2026-10-18T01:45:00.000Z"}]',
          '2026-10-18 01:30:00+00', '2026-10-18 01:45:00+00', 1, j, 'finish', '2026-10-18 01:45:00+00');
  set local role authenticated;
  perform public.t_as(j, '2026-10-18 03:30:00+00');
  r := public.remove_sleep_pause(sid, 7, 0);
  assert r ->> 'status' = 'error' and r ->> 'code' = 'overlap', '17d overlap is refused: ' || r::text;
  assert (select rev from public.sleeps where sleeps.id = sid) = 7, '17d and nothing changed';
  reset role;
  -- close it so the next scenarios can start sleeps
  update public.sleeps set closed_at = '2026-10-18 03:00:00+00' where sleeps.id = sid;
end $$;

-- 17e. Deleted sleeps are gone; strangers and signed-out callers are refused.
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  sid uuid; r jsonb; victim uuid;
begin
  reset role;
  insert into public.sleeps (baby_id, segments, started_at, closed_at, rev, last_by, last_action, last_at, deleted_at, deleted_by)
  values (baby,
          '[{"start": "2026-10-19T01:00:00.000Z", "end": "2026-10-19T01:20:00.000Z"},
            {"start": "2026-10-19T02:00:00.000Z", "end": "2026-10-19T03:00:00.000Z"}]',
          '2026-10-19 01:00:00+00', null, 2, j, 'delete', '2026-10-19 03:00:00+00',
          '2026-10-19 04:00:00+00', j)
  returning sleeps.id into sid;
  select x.id into victim from public.sleeps x where x.started_at = '2026-10-18 01:00:00+00';
  assert victim is not null, '17e found the 17d sleep';
  set local role authenticated;
  perform public.t_as(j, '2026-10-19 03:30:00+00');
  r := public.remove_sleep_pause(sid, 2, 0);
  assert r ->> 'status' = 'gone', '17e deleted sleep is gone: ' || r::text;
  r := public.remove_sleep_pause(gen_random_uuid(), 1, 0);
  assert r ->> 'status' = 'gone', '17e unknown sleep is gone: ' || r::text;

  -- the stranger (other household) can not touch someone else's sleep
  perform public.t_as('00000000-0000-0000-0000-0000000000b1', '2026-10-19 09:00:00+00');
  begin
    perform public.remove_sleep_pause(victim, 7, 0);
    assert false, '17e stranger';
  exception when others then
    assert sqlerrm = 'Not allowed', '17e stranger refused: ' || sqlerrm; end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform public.remove_sleep_pause(gen_random_uuid(), 1, 0);
    assert false, '17e anon';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 17f. The time adds up: removing a pause moves exactly its length into "asleep",
--      and Stop puts the sleep back with the same wake time.
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  sid uuid; r jsonb; before_ms numeric; after_ms numeric;
begin
  set local role authenticated;
  perform public.t_as(j, '2026-10-20 21:00:00+00');
  r := public.start_sleep(baby);  sid := (r -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(j, '2026-10-20 21:06:00+00'); r := public.pause_sleep(sid, 1);
  perform public.t_as(j, '2026-10-20 21:08:00+00'); r := public.resume_sleep(sid, 2);
  perform public.t_as(j, '2026-10-21 02:10:00+00'); r := public.pause_sleep(sid, 3);
  perform public.t_as(j, '2026-10-21 02:43:00+00'); r := public.resume_sleep(sid, 4);
  perform public.t_as(j, '2026-10-21 08:34:00+00'); r := public.stop_sleep(sid, 5);
  perform public.t_as(j, '2026-10-21 08:40:00+00'); r := public.reopen_sleep(sid, 6);
  select sum(extract(epoch from ((e ->> 'end')::timestamptz - (e ->> 'start')::timestamptz)) * 1000) into before_ms
    from public.sleeps s, jsonb_array_elements(s.segments) e where s.id = sid;
  r := public.remove_sleep_pause(sid, 7, 0);
  select sum(extract(epoch from ((e ->> 'end')::timestamptz - (e ->> 'start')::timestamptz)) * 1000) into after_ms
    from public.sleeps s, jsonb_array_elements(s.segments) e where s.id = sid;
  assert before_ms = (10 * 3600 + 59 * 60) * 1000, '17f 10 h 59 m before: ' || before_ms;
  assert after_ms = before_ms + 2 * 60 * 1000, '17f 11 h 01 m after: ' || after_ms;
  perform public.t_as(j, '2026-10-21 08:41:00+00');
  r := public.stop_sleep(sid, 8);
  assert (r -> 'sleep' ->> 'closed_at')::timestamptz = '2026-10-21 08:34:00+00', '17f same wake time after Stop: ' || r::text;
end $$;

-- 17g. A sleep that closed itself (3 h paused) is finished too, even though closed_at
--      has not been written yet: read-only, with the auto-close reason.
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  sid uuid; r jsonb;
begin
  perform public.t_as(j, '2026-10-22 21:00:00+00');
  r := public.start_sleep(baby);  sid := (r -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(j, '2026-10-22 21:30:00+00'); r := public.pause_sleep(sid, 1);
  perform public.t_as(j, '2026-10-22 21:40:00+00'); r := public.resume_sleep(sid, 2);
  perform public.t_as(j, '2026-10-22 22:10:00+00'); r := public.pause_sleep(sid, 3);
  perform public.t_as(j, '2026-10-23 01:11:00+00');
  r := public.remove_sleep_pause(sid, 4, 0);
  assert r ->> 'status' = 'conflict' and r ->> 'reason' = 'autoclosed', '17g auto-closed sleep is read-only: ' || r::text;
  assert (select rev from public.sleeps where sleeps.id = sid) = 4, '17g and nothing changed';
end $$;

select 'sleeps.sql: all checks passed' as result;

rollback;
