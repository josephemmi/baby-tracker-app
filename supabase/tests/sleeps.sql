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
-- The same scenarios are unit-tested in TypeScript in src/lib/sleep.test.ts and
-- src/lib/sleep-edit.test.ts. (JOS-103 retired the scenarios for reopen_sleep and
-- set_sleep_time: the app no longer calls them and a follow-up drops them.)

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

-- A step that must succeed: a wrong rev would otherwise be a quiet "conflict" reply.
create function public.t_ok(r jsonb, what text) returns jsonb language plpgsql as $$
begin
  assert r ->> 'status' = 'ok', what || ': ' || r::text;
  return r;
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

-- 9. Auto-close: 2 h paused; derived on read, written when the next sleep starts --
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

  -- 1 h 59 min 59 s later: still paused
  perform public.t_as(j, t0 + interval '30 minutes' + interval '1 hour 59 minutes 59 seconds');
  r := public.resume_sleep(a, 2);
  assert r ->> 'status' = 'ok', '9 resume just under 2 h: ' || r::text;
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

  -- exactly 2 h after the wake it has closed itself (but nothing is written yet)
  perform public.t_as(n, t0 + interval '30 minutes' + interval '2 hours');
  assert (select closed_at from public.sleeps where id = a) is null, '9 not written until read as stale';
  r := public.resume_sleep(a, 2);
  assert r ->> 'status' = 'conflict' and r ->> 'reason' = 'autoclosed', '9 resume on an auto-closed sleep: ' || r::text;
  r := public.stop_sleep(a, 2);
  assert r ->> 'reason' = 'autoclosed', '9 stop on an auto-closed sleep: ' || r::text;

  -- starting the next sleep closes it first, in the same transaction
  r := public.start_sleep(baby);
  assert r ->> 'status' = 'ok', '9 a new sleep can start: ' || r::text;
  b := (r -> 'sleep' ->> 'id')::uuid;
  assert (select closed_at from public.sleeps where id = a) = t0 + interval '30 minutes',
    '9 the old one is closed at its last wake, not at the new start';
  assert (select rev from public.sleeps where id = a) = 2, '9 closing it does not count as a change';
  assert (select last_action from public.sleeps where id = a) = 'autoclose'
     and (select last_by from public.sleeps where id = a) is null
     and (select last_at from public.sleeps where id = a) = t0 + interval '30 minutes' + interval '2 hours',
    '9 and the row says the app closed it, two hours after the pause began';
  assert (select count(*) from public.sleeps where closed_at is null) = 1, '9 exactly one open sleep';
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
  r := public.edit_sleep_times(b, 1, t0 + interval '10 seconds', null, '[]');
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

-- 17. Remove a pause (JOS-78): in every state since JOS-103 (a finished sleep is no longer
--     read-only), and the time adds up -----------------------------------------------
reset role;
delete from public.sleeps;
set local role authenticated;

-- 17a. The night from the screenshot: 21:00-21:06, 21:08-02:10, 02:43-08:34, then
--      finished. Remove both pauses from the finished sleep: it stays finished.
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

  -- finished: still removable (JOS-103); the screen is one change behind first
  perform public.t_as(n, '2026-10-17 08:40:00+00');

  -- stale rev: the screen is one change behind
  r := public.remove_sleep_pause(sid, 5, 0);
  assert r ->> 'status' = 'conflict' and r ->> 'reason' = 'stale', '17a stale rev is a conflict: ' || r::text;

  -- a pause that is not there
  r := public.remove_sleep_pause(sid, 6, 2);
  assert r ->> 'status' = 'error' and r ->> 'code' = 'no-pause', '17a index past the last pause: ' || r::text;
  r := public.remove_sleep_pause(sid, 6, -1);
  assert r ->> 'status' = 'error' and r ->> 'code' = 'no-pause', '17a negative index: ' || r::text;
  r := public.remove_sleep_pause(sid, 6, null);
  assert r ->> 'status' = 'error' and r ->> 'code' = 'no-pause', '17a null index: ' || r::text;
  assert (select rev from public.sleeps where sleeps.id = sid) = 6, '17a refusals change nothing';

  -- remove the first (2 min) pause, as Jen
  perform public.t_as(n, '2026-10-17 08:41:00+00');
  r := public.remove_sleep_pause(sid, 6, 0);
  assert r ->> 'status' = 'ok', '17a remove first pause: ' || r::text;
  s := r -> 'sleep';
  assert s -> 'segments' = '[{"start": "2026-10-16T21:00:00.000Z", "end": "2026-10-17T02:10:00.000Z"},
                            {"start": "2026-10-17T02:43:00.000Z", "end": "2026-10-17T08:34:00.000Z"}]'::jsonb,
         '17a stretches merged, the 33 min pause stays: ' || (s -> 'segments')::text;
  assert (s ->> 'rev')::int = 7, '17a rev bumps';
  assert s ->> 'last_action' = 'edit' and (s ->> 'last_by')::uuid = n, '17a recorded as Jen editing';
  assert (s ->> 'started_at')::timestamptz = '2026-10-16 21:00:00+00', '17a start unchanged';
  assert (s ->> 'closed_at')::timestamptz = '2026-10-17 08:34:00+00', '17a still finished, same wake';

  -- repeating the same call is a conflict, not a second removal
  r := public.remove_sleep_pause(sid, 6, 0);
  assert r ->> 'status' = 'conflict', '17a repeat is a conflict: ' || r::text;

  -- remove the last remaining pause, as Joseph: one stretch, no pauses
  perform public.t_as(j, '2026-10-17 08:42:00+00');
  r := public.remove_sleep_pause(sid, 7, 0);
  assert r ->> 'status' = 'ok', '17a remove last pause: ' || r::text;
  assert r -> 'sleep' -> 'segments' = '[{"start": "2026-10-16T21:00:00.000Z", "end": "2026-10-17T08:34:00.000Z"}]'::jsonb,
         '17a one stretch left: ' || (r -> 'sleep' -> 'segments')::text;
  assert (r -> 'sleep' ->> 'last_by')::uuid = j, '17a recorded as Joseph editing';
  r := public.remove_sleep_pause(sid, 8, 0);
  assert r ->> 'status' = 'error' and r ->> 'code' = 'no-pause', '17a nothing left to remove: ' || r::text;

  assert (select closed_at from public.sleeps where sleeps.id = sid) = '2026-10-17 08:34:00+00', '17a the wake time never moved';
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
--      and the wake time stays where it was.
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
  perform public.t_as(j, '2026-10-21 08:40:00+00');
  select sum(extract(epoch from ((e ->> 'end')::timestamptz - (e ->> 'start')::timestamptz)) * 1000) into before_ms
    from public.sleeps s, jsonb_array_elements(s.segments) e where s.id = sid;
  r := public.remove_sleep_pause(sid, 6, 0);
  select sum(extract(epoch from ((e ->> 'end')::timestamptz - (e ->> 'start')::timestamptz)) * 1000) into after_ms
    from public.sleeps s, jsonb_array_elements(s.segments) e where s.id = sid;
  assert before_ms = (10 * 3600 + 59 * 60) * 1000, '17f 10 h 59 m before: ' || before_ms;
  assert after_ms = before_ms + 2 * 60 * 1000, '17f 11 h 01 m after: ' || after_ms;
  assert (select closed_at from public.sleeps where id = sid) = '2026-10-21 08:34:00+00', '17f same wake time: ' || r::text;
end $$;

-- 17g. A sleep that closed itself (2 h paused) loses a pause the same way, and is written as
--      closed (the app's mark gone), though closed_at had not been written yet.
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
  perform public.t_as(j, '2026-10-23 00:11:00+00');
  assert (select closed_at from public.sleeps where sleeps.id = sid) is null, '17g not written until something touches it';
  r := public.remove_sleep_pause(sid, 4, 0);
  assert r ->> 'status' = 'ok', '17g auto-closed sleep: remove its pause: ' || r::text;
  assert (r -> 'sleep' ->> 'closed_at')::timestamptz = '2026-10-22 22:10:00+00', '17g written as closed at the pause start: ' || r::text;
  assert r -> 'sleep' ->> 'last_action' = 'edit', '17g and the edit replaces the "closed by the app" mark';
  assert r -> 'sleep' -> 'segments' = '[{"start": "2026-10-22T21:00:00.000Z", "end": "2026-10-22T22:10:00.000Z"}]'::jsonb, '17g';
end $$;

-- 18. Delete sleep on a FINISHED sleep (JOS-83) ------------------------------------
--     One write, first write wins; the household can read who deleted it (the app
--     says "Jen already deleted this sleep (6:08 pm)" from that row); and deleting
--     the newest sleep leaves the one before it as it was.
reset role;
delete from public.sleeps;
set local role authenticated;

do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  n constant uuid := '00000000-0000-0000-0000-0000000000a2';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  t0 constant timestamptz := '2026-10-24 13:00:00+00';
  a uuid; b uuid; r jsonb; seen record;
begin
  -- a: a nap 13:00 to 14:00. b: started by mistake, 15:00 to 15:03. Both finished.
  perform public.t_as(j, t0);
  a := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(j, t0 + interval '1 hour');
  perform public.t_ok(public.stop_sleep(a, 1), '18 stop a');
  perform public.t_as(j, t0 + interval '2 hours');
  b := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(j, t0 + interval '2 hours 3 minutes');
  perform public.t_ok(public.stop_sleep(b, 1), '18 stop b');

  perform public.t_as(j, t0 + interval '2 hours 10 minutes');

  -- 18b Jen deletes the finished b: one write, nothing else about it changes
  perform public.t_as(n, t0 + interval '2 hours 11 minutes');
  r := public.delete_sleep(b, 2);
  assert r ->> 'status' = 'ok', '18b delete a finished sleep: ' || r::text;
  assert r -> 'sleep' ->> 'last_action' = 'delete' and (r -> 'sleep' ->> 'last_by')::uuid = n, '18b who and what';
  assert (r -> 'sleep' ->> 'rev')::int = 3, '18b one rev';
  assert (r -> 'sleep' ->> 'closed_at')::timestamptz = t0 + interval '2 hours 3 minutes', '18b it keeps the wake it had';
  assert (r -> 'sleep' ->> 'deleted_at')::timestamptz = t0 + interval '2 hours 11 minutes', '18b deleted at the server time';
  assert (public.get_sleeps(baby, t0 - interval '1 day') -> 'sleeps' -> 0 ->> 'id')::uuid = a
     and jsonb_array_length(public.get_sleeps(baby, t0 - interval '1 day') -> 'sleeps') = 1, '18b gone from the Log, a is left';

  -- 18c first write wins: Joseph tapped Delete a moment later, on the rev he was looking at
  perform public.t_as(j, t0 + interval '2 hours 12 minutes');
  r := public.delete_sleep(b, 2);
  assert r ->> 'status' = 'gone', '18c Jen got there first: ' || r::text;
  -- and the household can read the deleted row to say who and when
  select s.deleted_by, s.deleted_at into seen from public.sleeps s where s.id = b;
  assert seen.deleted_by = n and seen.deleted_at = t0 + interval '2 hours 11 minutes',
    '18c the row says Jen, 2:11 pm after the start: ' || seen::text;

  -- 18d with b gone, Jen takes a pause out of a (a stop-and-start by mistake, 13:20 to 13:30)
  --      by editing its times: a finished sleep can be edited now
  perform public.t_as(n, t0 + interval '2 hours 20 minutes');
  r := public.edit_sleep_times(a, 2, t0, t0 + interval '1 hour',
         jsonb_build_array(jsonb_build_object('start', t0 + interval '20 minutes', 'end', t0 + interval '30 minutes')));
  assert r ->> 'status' = 'ok', '18d editing a finished sleep: ' || r::text;

  -- 18e Jen edited it first, so Joseph's Delete (tapped on the finished card, rev 2) loses
  perform public.t_as(j, t0 + interval '2 hours 21 minutes');
  r := public.delete_sleep(a, 2);
  assert r ->> 'status' = 'conflict' and r ->> 'reason' = 'stale', '18e delete on a stale finished card: ' || r::text;
  assert r -> 'sleep' ->> 'last_action' = 'edit' and (r -> 'sleep' ->> 'last_by')::uuid = n, '18e names what Jen did';
  assert (select deleted_at from public.sleeps where id = a) is null, '18e and a is untouched';
end $$;

-- 19. Restore from Recently Deleted (JOS-83): the overlap check every sleep write goes
--     through, and a restored sleep is always finished, so never a second open one. --
reset role;
delete from public.sleeps;
set local role authenticated;

do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  n constant uuid := '00000000-0000-0000-0000-0000000000a2';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  t0 constant timestamptz := '2026-10-25 09:00:00+00';
  x uuid; y uuid; z uuid; r jsonb;
begin
  -- x: 09:00 to 10:00, finished and then deleted by mistake
  perform public.t_as(j, t0);
  x := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;
  perform public.t_as(j, t0 + interval '1 hour');
  perform public.t_ok(public.stop_sleep(x, 1), '19 stop x');
  perform public.t_as(n, t0 + interval '1 hour 5 minutes');
  perform public.t_ok(public.delete_sleep(x, 2), '19 delete x');

  -- 19a with nothing in the way a finished, deleted sleep comes back finished
  perform public.t_as(j, t0 + interval '1 hour 10 minutes');
  r := public.restore_sleep(x);
  assert r ->> 'status' = 'ok', '19a restore: ' || r::text;
  assert r -> 'sleep' ->> 'closed_at' is not null and r -> 'sleep' ->> 'deleted_at' is null, '19a finished again';
  assert r -> 'sleep' ->> 'last_action' = 'restore', '19a';
  r := public.restore_sleep(x);
  assert r ->> 'status' = 'gone', '19a restoring what is not deleted: ' || r::text;

  -- 19b the sleep that really happened was logged over x's time ("Started earlier?"),
  --     which is allowed while x is deleted; then x can not come back, and the answer names y
  perform public.t_ok(public.delete_sleep(x, 4), '19b delete x again');   -- rev 4: restore bumped it
  perform public.t_as(j, t0 + interval '2 hours');
  y := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;
  r := public.edit_sleep_times(y, 1, t0 + interval '30 minutes', null, '[]');
  assert r ->> 'status' = 'ok', '19b y started earlier, over the deleted x: ' || r::text;
  r := public.restore_sleep(x);
  assert r ->> 'status' = 'error' and r ->> 'code' = 'overlap', '19b restore over a RUNNING sleep is refused: ' || r::text;
  assert r -> 'other' ->> 'id' = y::text, '19b names y';
  assert (select deleted_at from public.sleeps where id = x) is not null, '19b x is still deleted';

  -- 19c ... and the same once y is finished
  perform public.t_as(j, t0 + interval '2 hours 5 minutes');
  perform public.t_ok(public.stop_sleep(y, 2), '19c stop y');
  r := public.restore_sleep(x);
  assert r ->> 'code' = 'overlap', '19c restore over a FINISHED sleep is refused: ' || r::text;

  -- 19d a sleep is running elsewhere in the day; restoring a deleted one that does not touch it
  --     works, and the baby still has exactly one open sleep
  perform public.t_as(j, t0 + interval '3 hours');
  z := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;       -- running from 12:00
  perform public.t_ok(public.delete_sleep(y, 3), '19d delete y');                               -- y (09:30 to 11:05) out of the way
  r := public.restore_sleep(x);                                    -- x 09:00 to 10:00 fits again
  assert r ->> 'status' = 'ok', '19d restore beside a running sleep: ' || r::text;
  assert (select count(*) from public.sleeps where baby_id = baby and closed_at is null and deleted_at is null) = 1,
    '19d still exactly one open sleep';

  -- 19e a deleted sleep that was open when it was deleted was closed as it went, so it too comes
  --     back finished and never as a second running one
  perform public.t_as(n, t0 + interval '3 hours 30 minutes');
  perform public.t_ok(public.delete_sleep(z, 1), '19e delete z');                               -- z running since 12:00, deleted at 12:30
  assert (select closed_at from public.sleeps where id = z) = t0 + interval '3 hours 30 minutes', '19e closed where it was deleted';
  perform public.t_as(j, t0 + interval '4 hours');
  y := (public.start_sleep(baby) -> 'sleep' ->> 'id')::uuid;       -- a new sleep is running from 13:00
  r := public.restore_sleep(z);
  assert r ->> 'status' = 'ok', '19e restore the discarded one beside the new one: ' || r::text;
  assert r -> 'sleep' ->> 'closed_at' is not null, '19e finished';
  assert (select count(*) from public.sleeps where baby_id = baby and closed_at is null and deleted_at is null) = 1,
    '19e the baby still has one open sleep, not two';
end $$;

-- 20. Edit times (JOS-103): the one write for every time of a sleep and its pauses ---------
reset role;
delete from public.sleeps;

-- A sleep forged as the table owner at exact times. `segs` is the list of stretches;
-- `closed` makes it finished at its last end.
create function public.t_seed(segs jsonb, closed boolean default true, rev int default 1)
returns uuid language plpgsql as $$
declare sid uuid;
begin
  insert into public.sleeps (baby_id, logged_by, segments, started_at, closed_at, rev, last_by, last_action, last_at)
  values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', segs,
          (segs -> 0 ->> 'start')::timestamptz,
          case when closed then (segs -> -1 ->> 'end')::timestamptz end,
          rev, '00000000-0000-0000-0000-0000000000a1', 'start', (segs -> 0 ->> 'start')::timestamptz)
  returning sleeps.id into sid;
  return sid;
end $$;

-- A pause for the payload.
create function public.t_p(s timestamptz, e timestamptz) returns jsonb language sql as $$
  select jsonb_build_object('start', s, 'end', e) $$;

set local role authenticated;

-- 20a. A nap stopped too early (08:00-09:00): the end moves to 09:45, then a pause 09:00-09:05
--      goes in, then the end is cleared (it runs again, no pause made), then back.
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  n constant uuid := '00000000-0000-0000-0000-0000000000a2';
  d constant date := '2026-10-26';
  sid uuid; r jsonb; s jsonb;
begin
  reset role;
  sid := public.t_seed('[{"start": "2026-10-26T08:00:00.000Z", "end": "2026-10-26T09:00:00.000Z"}]');
  set local role authenticated;

  perform public.t_as(j, '2026-10-26 10:05:00+00');
  r := public.edit_sleep_times(sid, 1, d + time '08:00', d + time '09:45', '[]');
  assert r ->> 'status' = 'ok', '20a end 09:45: ' || r::text;
  s := r -> 'sleep';
  assert s -> 'segments' = '[{"start": "2026-10-26T08:00:00.000Z", "end": "2026-10-26T09:45:00.000Z"}]'::jsonb, '20a one stretch to 09:45: ' || (s -> 'segments')::text;
  assert (s ->> 'closed_at')::timestamptz = '2026-10-26 09:45:00+00', '20a finished at 09:45';
  assert (s ->> 'rev')::int = 2 and s ->> 'last_action' = 'edit' and (s ->> 'last_by')::uuid = j
     and (s ->> 'last_at')::timestamptz = '2026-10-26 10:05:00+00', '20a rev, who, what and when: ' || s::text;
  assert (s ->> 'started_at')::timestamptz = '2026-10-26 08:00:00+00', '20a started_at kept in step';

  perform public.t_as(n, '2026-10-26 10:06:00+00');
  r := public.edit_sleep_times(sid, 2, d + time '08:00', d + time '09:45',
         jsonb_build_array(public.t_p(d + time '09:00', d + time '09:05')));
  assert r ->> 'status' = 'ok', '20a add a pause: ' || r::text;
  assert r -> 'sleep' -> 'segments' = '[{"start": "2026-10-26T08:00:00.000Z", "end": "2026-10-26T09:00:00.000Z"},
                                         {"start": "2026-10-26T09:05:00.000Z", "end": "2026-10-26T09:45:00.000Z"}]'::jsonb,
         '20a two stretches: ' || (r -> 'sleep' -> 'segments')::text;
  assert (r -> 'sleep' ->> 'closed_at')::timestamptz = '2026-10-26 09:45:00+00', '20a still finished';

  -- clear Ended: it runs again, and no pause is made
  r := public.edit_sleep_times(sid, 3, d + time '08:00', null,
         jsonb_build_array(public.t_p(d + time '09:00', d + time '09:05')));
  assert r ->> 'status' = 'ok', '20a clear Ended: ' || r::text;
  assert r -> 'sleep' ->> 'closed_at' is null and r -> 'sleep' -> 'segments' -> 1 ->> 'end' is null, '20a running again';
  assert jsonb_array_length(r -> 'sleep' -> 'segments') = 2, '20a and still just the one pause';

  -- the last pause still going: paused (the last stretch ends where it began)
  r := public.edit_sleep_times(sid, 4, d + time '08:00', null,
         jsonb_build_array(public.t_p(d + time '09:00', d + time '09:05'), public.t_p(d + time '09:50', null)));
  assert r ->> 'status' = 'ok', '20a open last pause: ' || r::text;
  assert r -> 'sleep' ->> 'closed_at' is null and r -> 'sleep' -> 'segments' -> 1 ->> 'end' = '2026-10-26T09:50:00.000Z'
     and jsonb_array_length(r -> 'sleep' -> 'segments') = 2, '20a paused at 09:50: ' || (r -> 'sleep' -> 'segments')::text;

  -- take the only open pause away: it runs again
  r := public.edit_sleep_times(sid, 5, d + time '08:00', null,
         jsonb_build_array(public.t_p(d + time '09:00', d + time '09:05')));
  assert r -> 'sleep' -> 'segments' -> 1 ->> 'end' is null and r -> 'sleep' ->> 'closed_at' is null, '20a running after the open pause went';

  -- finish it with the pauses given in the wrong order: they are put in time order
  r := public.edit_sleep_times(sid, 6, d + time '08:00', d + time '09:45',
         jsonb_build_array(public.t_p(d + time '09:30', d + time '09:35'), public.t_p(d + time '09:00', d + time '09:05')));
  assert r ->> 'status' = 'ok', '20a unsorted pauses: ' || r::text;
  assert jsonb_array_length(r -> 'sleep' -> 'segments') = 3
     and r -> 'sleep' -> 'segments' -> 1 ->> 'start' = '2026-10-26T09:05:00.000Z'
     and r -> 'sleep' -> 'segments' -> 2 ->> 'start' = '2026-10-26T09:35:00.000Z', '20a time order: ' || (r -> 'sleep' -> 'segments')::text;

  -- remove every pause of a finished sleep: it keeps its start and end
  r := public.edit_sleep_times(sid, 7, d + time '08:00', d + time '09:45', '[]');
  assert r -> 'sleep' -> 'segments' = '[{"start": "2026-10-26T08:00:00.000Z", "end": "2026-10-26T09:45:00.000Z"}]'::jsonb, '20a';
  r := public.edit_sleep_times(sid, 8, d + time '08:00', d + time '09:45', null);
  assert r ->> 'status' = 'ok', '20a a null pause list is no pauses: ' || r::text;
end $$;

-- 20b. First write wins: a stale save changes nothing and says who, what and when.
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  n constant uuid := '00000000-0000-0000-0000-0000000000a2';
  d constant date := '2026-10-26';
  sid uuid := (select s.id from public.sleeps s);
  r jsonb; before_rev int;
begin
  select rev into before_rev from public.sleeps where id = sid;
  perform public.t_as(n, '2026-10-26 10:20:00+00');
  r := public.edit_sleep_times(sid, before_rev, d + time '08:00', d + time '09:40', '[]');
  assert r ->> 'status' = 'ok', '20b Jen saves first: ' || r::text;

  perform public.t_as(j, '2026-10-26 10:21:00+00');
  r := public.edit_sleep_times(sid, before_rev, d + time '08:00', d + time '09:30', '[]');
  assert r ->> 'status' = 'conflict' and r ->> 'reason' = 'stale', '20b Joseph is told: ' || r::text;
  assert (r -> 'sleep' ->> 'last_by')::uuid = n and r -> 'sleep' ->> 'last_action' = 'edit'
     and (r -> 'sleep' ->> 'last_at')::timestamptz = '2026-10-26 10:20:00+00', '20b it says who and when: ' || r::text;
  assert (select closed_at from public.sleeps where id = sid) = '2026-10-26 09:40:00+00', '20b and nothing changed';
  assert (select rev from public.sleeps where id = sid) = before_rev + 1, '20b rev untouched by the loser';
end $$;

-- 20c. Who can call it: a deleted sleep is gone, a stranger is refused, nobody signed out gets in.
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  d constant date := '2026-10-26';
  sid uuid := (select s.id from public.sleeps s);
  gone uuid; r jsonb;
begin
  r := public.edit_sleep_times(gen_random_uuid(), 1, d + time '08:00', d + time '09:00', '[]');
  assert r ->> 'status' = 'gone', '20c unknown sleep is gone: ' || r::text;

  perform public.t_as(j, '2026-10-26 10:30:00+00');
  r := public.delete_sleep(sid, (select rev from public.sleeps where id = sid));
  assert r ->> 'status' = 'ok', '20c delete: ' || r::text;
  r := public.edit_sleep_times(sid, (r -> 'sleep' ->> 'rev')::int, d + time '08:00', d + time '09:00', '[]');
  assert r ->> 'status' = 'gone', '20c a deleted sleep is gone: ' || r::text;
  r := public.restore_sleep(sid);
  assert r ->> 'status' = 'ok', '20c restore: ' || r::text;

  perform public.t_as('00000000-0000-0000-0000-0000000000b1', '2026-10-26 11:00:00+00');
  begin
    perform public.edit_sleep_times(sid, 99, d + time '08:00', d + time '09:00', '[]');
    assert false, '20c stranger';
  exception when others then
    assert sqlerrm = 'Not allowed', '20c stranger refused: ' || sqlerrm; end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform public.edit_sleep_times(gen_random_uuid(), 1, now(), null, '[]');
    assert false, '20c anon';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$
begin
  begin perform public.sleep_auto_close_after(); assert false, '20c helper';
  exception when insufficient_privilege then null; end;
  begin perform public.sleep_settle_autoclosed(gen_random_uuid(), now()); assert false, '20c helper 2';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 21. Every rule refuses, with the rule and the field, and writes nothing ---------------
delete from public.sleeps;
set local role authenticated;
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  d constant date := '2026-10-27';
  sid uuid; other uuid; r jsonb; rv int;
begin
  reset role;
  sid := public.t_seed('[{"start": "2026-10-27T08:00:00.000Z", "end": "2026-10-27T09:00:00.000Z"}]');
  other := public.t_seed('[{"start": "2026-10-27T11:00:00.000Z", "end": "2026-10-27T11:30:00.000Z"}]');
  set local role authenticated;
  perform public.t_as(j, '2026-10-27 10:00:00+00');
  rv := 1;

  -- future (the server's now is 10:00)
  r := public.edit_sleep_times(sid, rv, d + time '08:00', d + time '10:00:00.001', '[]');
  assert r ->> 'code' = 'future' and r ->> 'field' = 'se', '21 end in the future: ' || r::text;
  r := public.edit_sleep_times(sid, rv, d + time '10:01', null, '[]');
  assert r ->> 'code' = 'future' and r ->> 'field' = 'ss', '21 start in the future: ' || r::text;
  r := public.edit_sleep_times(sid, rv, d + time '08:00', d + time '09:55',
         jsonb_build_array(public.t_p(d + time '09:00', d + time '10:30')));
  assert r ->> 'code' = 'future' and r ->> 'field' = 'p0e', '21 pause end in the future: ' || r::text;
  r := public.edit_sleep_times(sid, rv, d + time '08:00', null,
         jsonb_build_array(public.t_p(d + time '10:30', null)));
  assert r ->> 'code' = 'future' and r ->> 'field' = 'p0s', '21 pause start in the future: ' || r::text;
  r := public.edit_sleep_times(sid, rv, d + time '08:00', d + time '10:00', '[]');
  assert r ->> 'status' = 'ok', '21 exactly now is fine: ' || r::text;
  rv := rv + 1;

  -- a minute: the sleep, a pause, the sleep before a pause and after it
  r := public.edit_sleep_times(sid, rv, d + time '08:00', d + time '08:00:59', '[]');
  assert r ->> 'code' = 'times' and r ->> 'rule' = 'order' and r ->> 'field' = 'se', '21 sleep under a minute: ' || r::text;
  r := public.edit_sleep_times(sid, rv, d + time '08:00', d + time '09:00',
         jsonb_build_array(public.t_p(d + time '08:00:30', d + time '08:10')));
  assert r ->> 'rule' = 'order' and r ->> 'field' = 'p0s', '21 pause under a minute after the start: ' || r::text;
  r := public.edit_sleep_times(sid, rv, d + time '08:00', d + time '09:00',
         jsonb_build_array(public.t_p(d + time '08:10', d + time '08:10:30')));
  assert r ->> 'rule' = 'order' and r ->> 'field' = 'p0e', '21 pause under a minute: ' || r::text;
  r := public.edit_sleep_times(sid, rv, d + time '08:00', d + time '09:00',
         jsonb_build_array(public.t_p(d + time '08:10', d + time '08:59:30')));
  assert r ->> 'rule' = 'order' and r ->> 'field' = 'se', '21 under a minute of sleep after the last pause: ' || r::text;
  r := public.edit_sleep_times(sid, rv, d + time '08:00', d + time '09:00',
         jsonb_build_array(public.t_p(d + time '08:10', d + time '08:59')));
  assert r ->> 'status' = 'ok', '21 exactly a minute each way is fine: ' || r::text;
  rv := rv + 1;

  -- pauses
  r := public.edit_sleep_times(sid, rv, d + time '08:00', d + time '09:00',
         jsonb_build_array(public.t_p(d + time '08:10', d + time '08:30'), public.t_p(d + time '08:20', d + time '08:40')));
  assert r ->> 'rule' = 'pause-overlap' and r ->> 'field' = 'p1s', '21 pauses overlap: ' || r::text;
  r := public.edit_sleep_times(sid, rv, d + time '08:00', d + time '09:00',
         jsonb_build_array(public.t_p(d + time '08:10', d + time '08:30'), public.t_p(d + time '08:30:30', d + time '08:40')));
  assert r ->> 'rule' = 'pause-gap' and r ->> 'field' = 'p1s', '21 under a minute of sleep between pauses: ' || r::text;
  r := public.edit_sleep_times(sid, rv, d + time '08:00', d + time '09:00',
         jsonb_build_array(public.t_p(d + time '08:10', d + time '08:30'), public.t_p(d + time '08:31', d + time '08:40')));
  assert r ->> 'status' = 'ok', '21 exactly a minute between pauses is fine: ' || r::text;
  rv := rv + 1;
  r := public.edit_sleep_times(sid, rv, d + time '08:00', null,
         jsonb_build_array(public.t_p(d + time '08:10', null), public.t_p(d + time '08:30', d + time '08:40')));
  assert r ->> 'rule' = 'open-not-last' and r ->> 'field' = 'p0e', '21 only the last pause can be going: ' || r::text;
  r := public.edit_sleep_times(sid, rv, d + time '08:00', d + time '09:00',
         jsonb_build_array(public.t_p(d + time '08:10', d + time '08:20'), public.t_p(d + time '08:30', null)));
  assert r ->> 'rule' = 'open-needs-end' and r ->> 'field' = 'p1e', '21 a finished sleep has no pause going: ' || r::text;
  r := public.edit_sleep_times(sid, rv, d + time '08:00', d + time '09:00',
         jsonb_build_array(jsonb_build_object('end', d + time '08:20')));
  assert r ->> 'rule' = 'needs-time' and r ->> 'field' = 'p0s', '21 a pause without a start: ' || r::text;
  r := public.edit_sleep_times(sid, rv, null, d + time '09:00', '[]');
  assert r ->> 'rule' = 'needs-time' and r ->> 'field' = 'ss', '21 no start: ' || r::text;

  -- another sleep: 11:00 to 11:30 is in the future, so use one in the past
  reset role;
  update public.sleeps set segments = '[{"start": "2026-10-27T05:00:00.000Z", "end": "2026-10-27T06:00:00.000Z"}]',
         started_at = '2026-10-27 05:00:00+00', closed_at = '2026-10-27 06:00:00+00' where id = other;
  set local role authenticated;
  r := public.edit_sleep_times(sid, rv, d + time '05:30', d + time '09:00', '[]');
  assert r ->> 'code' = 'overlap' and r -> 'other' ->> 'id' = other::text, '21 starts inside another sleep: ' || r::text;
  r := public.edit_sleep_times(sid, rv, d + time '04:00', d + time '09:00', '[]');
  assert r ->> 'code' = 'overlap', '21 swallows another sleep: ' || r::text;
  r := public.edit_sleep_times(sid, rv, d + time '06:00', d + time '09:00', '[]');
  assert r ->> 'status' = 'ok', '21 touching the end of another sleep is fine: ' || r::text;
  rv := rv + 1;
  r := public.edit_sleep_times(sid, rv, d + time '06:30', d + time '07:00', '[]');
  assert r ->> 'status' = 'ok', '21 well clear of it: ' || r::text;
  r := public.edit_sleep_times(sid, rv + 1, d + time '04:00', d + time '05:00', '[]');
  assert r ->> 'status' = 'ok', '21 touching the start of another sleep is fine: ' || r::text;
  r := public.edit_sleep_times(sid, rv + 2, d + time '08:00', d + time '09:00',
         jsonb_build_array(public.t_p(d + time '08:30', d + time '08:40')));
  assert r ->> 'status' = 'ok', '21 back to a fit: ' || r::text;
end $$;
-- (every refusal above came back before anything was written: the rev moved only on the eight
--  successes, 1 -> 9... counting from the start: now, a minute, a minute between pauses, touching
--  the end, clear of it, touching the start, back to a fit = 7 saves, rev 8)
do $$
declare sid uuid := (select s.id from public.sleeps s where s.started_at >= '2026-10-27 07:00:00+00' order by s.started_at limit 1);
begin
  assert (select rev from public.sleeps where id = sid) = 8, '21 refusals wrote nothing: rev ' || (select rev from public.sleeps where id = sid);
end $$;

-- 21b. A running sleep elsewhere counts as another sleep, up to now.
reset role;
delete from public.sleeps;
set local role authenticated;
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  d constant date := '2026-10-28';
  fin uuid; running uuid; r jsonb;
begin
  reset role;
  fin := public.t_seed('[{"start": "2026-10-28T06:00:00.000Z", "end": "2026-10-28T07:00:00.000Z"}]');
  running := public.t_seed('[{"start": "2026-10-28T09:00:00.000Z", "end": null}]', false);
  set local role authenticated;
  perform public.t_as(j, '2026-10-28 12:00:00+00');
  r := public.edit_sleep_times(fin, 1, d + time '06:00', d + time '09:30', '[]');
  assert r ->> 'code' = 'overlap' and r -> 'other' ->> 'id' = running::text, '21b over the running sleep: ' || r::text;
  r := public.edit_sleep_times(fin, 1, d + time '06:00', d + time '09:00', '[]');
  assert r ->> 'status' = 'ok', '21b up to where it started is fine: ' || r::text;
  -- and the running one can not be moved back over the finished one
  r := public.edit_sleep_times(running, 1, d + time '08:30', null, '[]');
  assert r ->> 'code' = 'overlap', '21b the running one can not start inside: ' || r::text;
  r := public.edit_sleep_times(running, 1, d + time '09:00:00', null, '[]');
  assert r ->> 'status' = 'ok', '21b an edit that changes nothing still saves (the app does not offer it): ' || r::text;
end $$;

-- 22. Auto-close at 2 h (JOS-103), and what an edit does to a sleep that closed itself ------
reset role;
delete from public.sleeps;
set local role authenticated;
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  d constant date := '2026-10-29';
  a uuid; b uuid; r jsonb;
begin
  -- the night of the ticket: a pause from 23:25 never resumed, the sleep closed itself at 01:00
  reset role;
  a := public.t_seed('[{"start": "2026-10-28T21:00:00.000Z", "end": "2026-10-28T23:10:00.000Z"},
                       {"start": "2026-10-28T23:25:00.000Z", "end": "2026-10-29T01:00:00.000Z"}]', false, 5);
  set local role authenticated;

  -- (sleep_state is a helper members can not call: read it as the owner)
  reset role;
  perform public.t_as(j, '2026-10-29 02:59:59+00');
  assert (select public.sleep_state(s, public.sleep_now()) from public.sleeps s where id = a) = 'paused', '22 1 h 59 min 59 s: still paused';
  perform public.t_as(j, '2026-10-29 03:00:00+00');
  assert (select public.sleep_state(s, public.sleep_now()) from public.sleeps s where id = a) = 'finished', '22 2 h: closed itself';
  set local role authenticated;

  -- at 08:00 it is edited: ended 07:10, with a pause 01:00 to 01:30 that was never logged
  perform public.t_as(j, '2026-10-29 08:00:00+00');
  r := public.edit_sleep_times(a, 5, '2026-10-28 21:00:00+00', '2026-10-29 07:10:00+00',
         jsonb_build_array(public.t_p('2026-10-28 23:10:00+00', '2026-10-28 23:25:00+00'),
                           public.t_p('2026-10-29 01:00:00+00', '2026-10-29 01:30:00+00')));
  assert r ->> 'status' = 'ok', '22 the sleep that closed itself is fixed: ' || r::text;
  assert (r -> 'sleep' ->> 'closed_at')::timestamptz = '2026-10-29 07:10:00+00' and r -> 'sleep' ->> 'last_action' = 'edit',
         '22 closed for good by a person, not the app: ' || r::text;
  assert jsonb_array_length(r -> 'sleep' -> 'segments') = 3, '22 three stretches';
end $$;

-- 22b. The close is written when the next sleep starts, and it keeps saying "the app" until an edit
reset role;
delete from public.sleeps;
set local role authenticated;
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  a uuid; b uuid; r jsonb; n int;
begin
  reset role;
  a := public.t_seed('[{"start": "2026-10-30T01:00:00.000Z", "end": "2026-10-30T01:30:00.000Z"}]', false, 3);
  set local role authenticated;

  perform public.t_as(j, '2026-10-30 06:00:00+00');
  r := public.start_sleep(baby);
  assert r ->> 'status' = 'ok', '22b start beside the sleep that closed itself: ' || r::text;
  b := (r -> 'sleep' ->> 'id')::uuid;
  assert (select closed_at from public.sleeps where id = a) = '2026-10-30 01:30:00+00', '22b the close is written at the pause start';
  assert (select last_action from public.sleeps where id = a) = 'autoclose'
     and (select last_by from public.sleeps where id = a) is null
     and (select last_at from public.sleeps where id = a) = '2026-10-30 03:30:00+00'
     and (select rev from public.sleeps where id = a) = 3, '22b marked as the app, two hours on, no new rev';

  -- an edit that changes the times replaces the mark
  r := public.edit_sleep_times(a, 3, '2026-10-30 01:00:00+00', '2026-10-30 02:00:00+00', '[]');
  assert r ->> 'status' = 'ok' and r -> 'sleep' ->> 'last_action' = 'edit', '22b a person editing clears it: ' || r::text;
  r := public.stop_sleep(b, 1);
end $$;

-- 22c. An edit that leaves a sleep paused past 2 h is written as closed, so it never blocks a start
reset role;
delete from public.sleeps;
set local role authenticated;
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  baby constant uuid := '00000000-0000-0000-0000-0000000000d1';
  a uuid; r jsonb;
begin
  reset role;
  a := public.t_seed('[{"start": "2026-10-31T01:00:00.000Z", "end": "2026-10-31T02:00:00.000Z"}]');
  set local role authenticated;
  perform public.t_as(j, '2026-10-31 08:00:00+00');
  r := public.edit_sleep_times(a, 1, '2026-10-31 01:00:00+00', null,
         jsonb_build_array(public.t_p('2026-10-31 02:00:00+00', null)));
  assert r ->> 'status' = 'ok' and (r -> 'sleep' ->> 'closed_at')::timestamptz = '2026-10-31 02:00:00+00', '22c written closed: ' || r::text;
  r := public.start_sleep(baby);
  assert r ->> 'status' = 'ok', '22c and a new sleep can start: ' || r::text;
end $$;

-- 23. Bringing a finished sleep back to life (clearing Ended) while the baby has another ---
reset role;
delete from public.sleeps;
set local role authenticated;
do $$
declare
  j constant uuid := '00000000-0000-0000-0000-0000000000a1';
  d constant date := '2026-11-02';
  old uuid; going uuid; selfclosed uuid; r jsonb;
begin
  reset role;
  old := public.t_seed('[{"start": "2026-11-02T09:00:00.000Z", "end": "2026-11-02T09:30:00.000Z"}]');
  going := public.t_seed('[{"start": "2026-11-02T08:00:00.000Z", "end": "2026-11-02T08:30:00.000Z"}]', false);
  set local role authenticated;

  -- `going` is paused 1 h 35 min: still open, so `old` can not run again beside it
  perform public.t_as(j, '2026-11-02 10:05:00+00');
  r := public.edit_sleep_times(old, 1, d + time '09:00', null, '[]');
  assert r ->> 'status' = 'open_exists' and r -> 'sleep' ->> 'id' = going::text, '23 another sleep is going: ' || r::text;
  assert (select closed_at from public.sleeps where id = old) is not null and (select rev from public.sleeps where id = old) = 1, '23 and nothing changed';

  -- ... once it has closed itself it does not count, and it is written closed as the edit happens
  perform public.t_as(j, '2026-11-02 10:30:00+00');
  r := public.edit_sleep_times(old, 1, d + time '09:00', null, '[]');
  assert r ->> 'status' = 'ok', '23 the other one closed itself: ' || r::text;
  assert r -> 'sleep' ->> 'closed_at' is null, '23 old is running again';
  assert (select closed_at from public.sleeps where id = going) = '2026-11-02 08:30:00+00'
     and (select last_action from public.sleeps where id = going) = 'autoclose'
     and (select rev from public.sleeps where id = going) = 1, '23 the other one is written closed by the app, with no new rev';
  assert (select count(*) from public.sleeps where closed_at is null and deleted_at is null) = 1, '23 exactly one open sleep';
end $$;

-- 24. Realtime and grants are those of every other sleep write ----------------------------
do $$
begin
  assert exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sleeps'),
    '24 the sleeps table is still in the realtime publication';
  assert has_function_privilege('authenticated', 'public.edit_sleep_times(uuid, integer, timestamptz, timestamptz, jsonb)', 'execute'),
    '24 members can call it';
  assert not has_function_privilege('anon', 'public.edit_sleep_times(uuid, integer, timestamptz, timestamptz, jsonb)', 'execute'),
    '24 signed-out callers can not';
  assert (select prosecdef from pg_proc where proname = 'edit_sleep_times'), '24 security definer, like its siblings';
  assert (select proconfig from pg_proc where proname = 'edit_sleep_times') = array['search_path=public'], '24 search_path pinned';
end $$;

select 'sleeps.sql: all checks passed' as result;

rollback;
