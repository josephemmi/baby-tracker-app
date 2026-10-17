-- Sleep tracker (JOS-56, v1.12): a shared, timed sleep session per baby.
-- Additive only — a new table, indexes, functions and one realtime
-- publication entry. No existing table or row is touched.
--
-- Design notes (the "why" lives here so the PR doesn't have to carry it):
--
-- * One row per sleep. The stretches ("asleep from..to", with pauses between)
--   are a jsonb array on that row — [{"start": ..., "end": ...}, ...] with the
--   last `end` null while running — rather than a child table. Every action
--   (pause, resume, stop, reopen, edit) is then ONE conditional update of ONE
--   row, so "first write wins" is a single `where rev = ...`, and Realtime
--   delivers the whole sleep in a single UPDATE event that both phones can
--   replace their local copy with. A child table would need a multi-row
--   transaction per action and two subscriptions that can arrive out of order.
-- * Elapsed time is never stored, only timestamps. Clients derive it.
-- * Every write goes through the SECURITY DEFINER functions below, which use
--   the SERVER's clock for "now" actions (a phone with the wrong time can't
--   skew a sleep) and validate picked times (not in the future, in order, no
--   overlap). The table itself only lets household members read it and edit
--   its note and who-pill.
-- * `rev` goes up by one on every state change. Note and who-pill edits do not
--   bump it, so one parent editing a note never makes the other parent's
--   Pause fail with a false "already changed" conflict.

create table public.sleeps (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  -- Who started it; the who-pill on the card (can be cycled, like entries).
  logged_by uuid references public.users (id) on delete set null,
  -- [{"start": "2026-10-16T17:20:00.000Z", "end": null}, ...] — UTC ISO text.
  segments jsonb not null,
  -- The first stretch's start, kept in step by the trigger below so Home can
  -- fetch and order by it without unpacking the jsonb.
  started_at timestamptz not null,
  -- Null while open (asleep or paused). Always equals the last stretch's end.
  closed_at timestamptz,
  rev integer not null default 1 check (rev >= 1),
  -- Who made the last state change, what it was, and when it took effect —
  -- the "Jen already paused this sleep (6:08 pm)" message.
  last_by uuid references public.users (id) on delete set null,
  last_action text not null check (
    last_action in ('start', 'pause', 'resume', 'finish', 'reopen', 'edit', 'delete', 'restore')
  ),
  last_at timestamptz not null,
  notes text,
  -- Soft delete, same 7-day Recently Deleted window as entries.
  deleted_at timestamptz,
  deleted_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- One open (running or paused) sleep per baby. A sleep that has merely
-- auto-closed (3 h paused) still counts as open here until `start_sleep`
-- writes its closed_at, which it does first, in the same transaction.
create unique index sleeps_one_open_per_baby
  on public.sleeps (baby_id)
  where closed_at is null and deleted_at is null;

create index sleeps_baby_id_started_at_idx on public.sleeps (baby_id, started_at desc);
create index sleeps_baby_id_deleted_at_idx
  on public.sleeps (baby_id, deleted_at)
  where deleted_at is not null;

/* ---------- row-level security ---------- */

alter table public.sleeps enable row level security;

create policy "Members can view their household's sleeps" on public.sleeps
  for select using (
    baby_id in (
      select id from public.babies where household_id = public.current_household_id()
    )
  );

create policy "Members can update their household's sleeps" on public.sleeps
  for update using (
    baby_id in (
      select id from public.babies where household_id = public.current_household_id()
    )
  );

-- No insert or delete policy: sleeps are created by start_sleep() and are only
-- ever soft-deleted by delete_sleep(). Of the columns, members may edit only
-- the note and the who-pill directly; everything that changes the sleep's
-- state goes through the functions below.
revoke all on public.sleeps from anon, authenticated;
grant select on public.sleeps to authenticated;
grant update (notes, logged_by) on public.sleeps to authenticated;

-- Broadcast changes so the other parent sees a sleep start, pause and stop
-- live (subject to the policies above).
alter publication supabase_realtime add table public.sleeps;

/* ---------- helpers (not callable from the API) ---------- */

-- The server's clock, to the millisecond, for every "now" action. (Tests
-- replace this to move time; nothing else should.)
create function public.sleep_now()
returns timestamptz
language sql
stable
as $$
  select date_trunc('milliseconds', now());
$$;

-- An instant as it is written inside `segments`: UTC, millisecond precision.
create function public.sleep_ts(t timestamptz)
returns text
language sql
immutable
as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

create function public.sleep_first_start(segs jsonb)
returns timestamptz
language sql
stable
as $$
  select (segs -> 0 ->> 'start')::timestamptz;
$$;

create function public.sleep_last_start(segs jsonb)
returns timestamptz
language sql
stable
as $$
  select (segs -> -1 ->> 'start')::timestamptz;
$$;

-- Null while the last stretch is still running.
create function public.sleep_last_end(segs jsonb)
returns timestamptz
language sql
stable
as $$
  select (segs -> -1 ->> 'end')::timestamptz;
$$;

-- asleep: last stretch open. paused: last stretch ended. finished: closed, or
-- paused for more than 3 h (it closes itself; closed_at is only written when
-- the next sleep starts, so this is derived on every read).
create function public.sleep_state(s public.sleeps, p_now timestamptz)
returns text
language sql
stable
as $$
  select case
    when s.closed_at is not null then 'finished'
    when public.sleep_last_end(s.segments) is null then 'asleep'
    when p_now - public.sleep_last_end(s.segments) > interval '3 hours' then 'finished'
    else 'paused'
  end;
$$;

-- Keeps the row honest whoever writes it: stretches well-formed and in order,
-- only the last one open, closed_at equal to the last end, and the who-pill
-- pointing at someone in this baby's household.
--
-- SECURITY DEFINER because it also fires for a member's own direct edit of the
-- note or who-pill, and the helpers it calls are not callable by members.
-- (Left as security invoker it works or fails depending on which role first
-- ran it on a given database connection — plpgsql caches the plan.)
create function public.sleeps_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_elem jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_prev_end timestamptz;
  v_i integer := 0;
  v_n integer;
begin
  if jsonb_typeof(new.segments) is distinct from 'array' or jsonb_array_length(new.segments) = 0 then
    raise exception 'A sleep needs at least one stretch.';
  end if;

  v_n := jsonb_array_length(new.segments);
  for v_elem in select value from jsonb_array_elements(new.segments) loop
    v_i := v_i + 1;
    if jsonb_typeof(v_elem) is distinct from 'object' or (v_elem ->> 'start') is null then
      raise exception 'Stretch % needs a start time.', v_i;
    end if;
    v_start := (v_elem ->> 'start')::timestamptz;
    v_end := (v_elem ->> 'end')::timestamptz;
    if v_end is null and v_i <> v_n then
      raise exception 'Only the last stretch can still be running.';
    end if;
    if v_end is not null and v_end < v_start then
      raise exception 'Stretch % ends before it starts.', v_i;
    end if;
    if v_prev_end is not null and v_start < v_prev_end then
      raise exception 'Stretch % starts before stretch % ends.', v_i, v_i - 1;
    end if;
    v_prev_end := v_end;
  end loop;

  new.started_at := public.sleep_first_start(new.segments);

  if new.closed_at is not null
     and new.closed_at is distinct from public.sleep_last_end(new.segments) then
    raise exception 'A closed sleep must end where its last stretch ends.';
  end if;

  if new.logged_by is not null
     and (tg_op = 'INSERT' or new.logged_by is distinct from old.logged_by)
     and not exists (
       select 1
       from public.users u
       join public.babies b on b.household_id = u.household_id
       where u.id = new.logged_by and b.id = new.baby_id
     ) then
    raise exception 'That person is not in this household.';
  end if;

  return new;
end;
$$;

create trigger sleeps_before_write
  before insert or update on public.sleeps
  for each row execute function public.sleeps_before_write();

create function public.sleep_assert_member(p_baby_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1 from public.babies b
    where b.id = p_baby_id and b.household_id = public.current_household_id()
  ) then
    raise exception 'Not allowed';
  end if;
end;
$$;

-- Serialises every sleep write for a baby (overlap checks read other rows, so
-- two writers must not interleave), then returns the sleep row, locked and
-- freshly read. An all-null row means "no such sleep".
create function public.sleep_lock(p_id uuid)
returns public.sleeps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_baby uuid;
  v public.sleeps;
begin
  select baby_id into v_baby from public.sleeps where id = p_id;
  if v_baby is null then
    return v;
  end if;
  perform public.sleep_assert_member(v_baby);
  perform pg_advisory_xact_lock(hashtextextended('sleeps:' || v_baby::text, 0));
  select * into v from public.sleeps where id = p_id for update;
  return v;
end;
$$;

-- Every function answers with one envelope so the client never has to guess:
--   { status: 'ok',        sleep, now }
--   { status: 'conflict',  sleep, reason: 'stale' | 'autoclosed', now }
--   { status: 'gone',      now }                       (deleted or never there)
--   { status: 'open_exists', sleep, now }              (start / reopen)
--   { status: 'error',     code, ...detail, now }      (a rule said no)
-- `now` is the server's clock, which clients use to correct their own timer.
create function public.sleep_reply(
  p_status text,
  p_now timestamptz,
  p_sleep public.sleeps default null,
  p_extra jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('status', p_status, 'now', public.sleep_ts(p_now))
    || case when p_sleep.id is null then '{}'::jsonb
            else jsonb_build_object('sleep', to_jsonb(p_sleep)) end
    || p_extra;
$$;

-- "Someone else got there first" — or the sleep closed itself meanwhile.
create function public.sleep_conflict(p_sleep public.sleeps, p_now timestamptz)
returns jsonb
language sql
stable
as $$
  select public.sleep_reply(
    'conflict', p_now, p_sleep,
    jsonb_build_object(
      'reason',
      case when p_sleep.closed_at is null
                and public.sleep_state(p_sleep, p_now) = 'finished'
           then 'autoclosed' else 'stale' end
    )
  );
$$;

-- The rules for a set of stretches. Null when they are fine, else the error
-- ({code, ...}): well-formed, not in the future, in order, and not overlapping
-- any other live sleep of the baby.
create function public.sleep_check_segments(
  p_baby_id uuid,
  p_id uuid,
  p_segs jsonb,
  p_now timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_elem jsonb;
  v_i integer := 0;
  v_n integer := jsonb_array_length(p_segs);
  v_start timestamptz;
  v_end timestamptz;
  v_prev timestamptz := '-infinity';
  v_other public.sleeps;
begin
  if v_n = 0 then
    return jsonb_build_object('code', 'empty');
  end if;

  for v_elem in select value from jsonb_array_elements(p_segs) loop
    v_i := v_i + 1;
    v_start := (v_elem ->> 'start')::timestamptz;
    v_end := (v_elem ->> 'end')::timestamptz;
    if v_start is null then
      return jsonb_build_object('code', 'bad-time', 'n', v_i);
    end if;
    if v_start > p_now or v_end > p_now then
      return jsonb_build_object('code', 'future', 'n', v_i);
    end if;
    if v_end is null and v_i <> v_n then
      return jsonb_build_object('code', 'open', 'n', v_i);
    end if;
    if v_end < v_start then
      return jsonb_build_object('code', 'inverted', 'n', v_i);
    end if;
    if v_start < v_prev then
      return jsonb_build_object('code', 'order', 'n', v_i);
    end if;
    v_prev := coalesce(v_end, p_now);
  end loop;

  for v_other in
    select * from public.sleeps o
    where o.baby_id = p_baby_id and o.deleted_at is null and o.id is distinct from p_id
  loop
    if exists (
      select 1
      from jsonb_array_elements(p_segs) as a(v),
           jsonb_array_elements(v_other.segments) as b(v)
      where (a.v ->> 'start')::timestamptz < coalesce((b.v ->> 'end')::timestamptz, p_now)
        and (b.v ->> 'start')::timestamptz < coalesce((a.v ->> 'end')::timestamptz, p_now)
    ) then
      return jsonb_build_object('code', 'overlap', 'other', to_jsonb(v_other));
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function
  public.sleep_now(), public.sleep_ts(timestamptz), public.sleep_first_start(jsonb),
  public.sleep_last_start(jsonb), public.sleep_last_end(jsonb),
  public.sleep_state(public.sleeps, timestamptz), public.sleeps_before_write(),
  public.sleep_assert_member(uuid), public.sleep_lock(uuid),
  public.sleep_reply(text, timestamptz, public.sleeps, jsonb),
  public.sleep_conflict(public.sleeps, timestamptz),
  public.sleep_check_segments(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;

/* ---------- the actions (called from the app) ---------- */

-- Home's read: the server's clock plus every live sleep from `p_since` on,
-- and any sleep still open however old it is. Returning the clock with the
-- rows is what lets every refetch re-correct a phone whose own clock is off.
create function public.get_sleeps(p_baby_id uuid, p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sleep_assert_member(p_baby_id);
  return jsonb_build_object(
    'now', public.sleep_ts(public.sleep_now()),
    'sleeps', coalesce(
      (select jsonb_agg(to_jsonb(s) order by s.started_at desc)
       from (
         select * from public.sleeps
         where baby_id = p_baby_id
           and deleted_at is null
           and (closed_at is null or started_at >= p_since)
         order by started_at desc
         limit 200
       ) s),
      '[]'::jsonb
    )
  );
end;
$$;

-- Tap on the Sleep tile: start a sleep NOW (server clock). First closes any
-- sleep that has auto-closed, in this same transaction, so the one-open-sleep
-- rule never blocks on a sleep that has already ended. If a sleep really is
-- still open, answers open_exists with it.
create function public.start_sleep(p_baby_id uuid, p_logged_by uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.sleep_now();
  v_open public.sleeps;
  v_new public.sleeps;
  v_segs jsonb;
  v_err jsonb;
begin
  perform public.sleep_assert_member(p_baby_id);
  perform pg_advisory_xact_lock(hashtextextended('sleeps:' || p_baby_id::text, 0));

  if p_logged_by is not null and not exists (
    select 1 from public.users u
    where u.id = p_logged_by and u.household_id = public.current_household_id()
  ) then
    raise exception 'Not allowed';
  end if;

  update public.sleeps s
     set closed_at = public.sleep_last_end(s.segments)
   where s.baby_id = p_baby_id
     and s.closed_at is null
     and s.deleted_at is null
     and public.sleep_state(s, v_now) = 'finished';

  select * into v_open from public.sleeps s
   where s.baby_id = p_baby_id and s.closed_at is null and s.deleted_at is null;
  if found then
    return public.sleep_reply('open_exists', v_now, v_open);
  end if;

  v_segs := jsonb_build_array(
    jsonb_build_object('start', public.sleep_ts(v_now), 'end', null)
  );
  v_err := public.sleep_check_segments(p_baby_id, null, v_segs, v_now);
  if v_err is not null then
    return public.sleep_reply('error', v_now, null, v_err);
  end if;

  begin
    insert into public.sleeps (baby_id, logged_by, segments, last_by, last_action, last_at)
    values (p_baby_id, coalesce(p_logged_by, auth.uid()), v_segs, auth.uid(), 'start', v_now)
    returning * into v_new;
  exception when unique_violation then
    select * into v_open from public.sleeps s
     where s.baby_id = p_baby_id and s.closed_at is null and s.deleted_at is null;
    return public.sleep_reply('open_exists', v_now, v_open);
  end;

  return public.sleep_reply('ok', v_now, v_new);
end;
$$;

-- Pause Sleep. Needs the current stretch to be at least a minute old.
create function public.pause_sleep(p_id uuid, p_rev integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.sleep_now();
  v public.sleeps;
begin
  v := public.sleep_lock(p_id);
  if v.id is null or v.deleted_at is not null then
    return public.sleep_reply('gone', v_now);
  end if;
  if v.rev <> p_rev or public.sleep_state(v, v_now) <> 'asleep' then
    return public.sleep_conflict(v, v_now);
  end if;
  if v_now < public.sleep_last_start(v.segments) + interval '1 minute' then
    return public.sleep_reply(
      'error', v_now, v,
      jsonb_build_object('code', 'short', 'stretchStart', public.sleep_ts(public.sleep_last_start(v.segments)))
    );
  end if;

  update public.sleeps
     set segments = jsonb_set(
           v.segments,
           array[(jsonb_array_length(v.segments) - 1)::text, 'end'],
           to_jsonb(public.sleep_ts(v_now))
         ),
         rev = rev + 1, last_by = auth.uid(), last_action = 'pause', last_at = v_now
   where id = v.id
   returning * into v;
  return public.sleep_reply('ok', v_now, v);
end;
$$;

-- Resume Sleep: a new stretch starting now.
create function public.resume_sleep(p_id uuid, p_rev integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.sleep_now();
  v public.sleeps;
  v_segs jsonb;
  v_err jsonb;
begin
  v := public.sleep_lock(p_id);
  if v.id is null or v.deleted_at is not null then
    return public.sleep_reply('gone', v_now);
  end if;
  if v.rev <> p_rev or public.sleep_state(v, v_now) <> 'paused' then
    return public.sleep_conflict(v, v_now);
  end if;

  v_segs := v.segments || jsonb_build_array(
    jsonb_build_object('start', public.sleep_ts(v_now), 'end', null)
  );
  v_err := public.sleep_check_segments(v.baby_id, v.id, v_segs, v_now);
  if v_err is not null then
    return public.sleep_reply('error', v_now, v, v_err);
  end if;

  update public.sleeps
     set segments = v_segs,
         rev = rev + 1, last_by = auth.uid(), last_action = 'resume', last_at = v_now
   where id = v.id
   returning * into v;
  return public.sleep_reply('ok', v_now, v);
end;
$$;

-- Stop Sleep. Works at any time, by either parent — there is no minimum here
-- (the "less than a minute" dialog is the app's). Running: ends now. Paused:
-- closes at the last wake time.
create function public.stop_sleep(p_id uuid, p_rev integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.sleep_now();
  v public.sleeps;
  v_state text;
begin
  v := public.sleep_lock(p_id);
  if v.id is null or v.deleted_at is not null then
    return public.sleep_reply('gone', v_now);
  end if;
  v_state := public.sleep_state(v, v_now);
  if v.rev <> p_rev or v_state = 'finished' then
    return public.sleep_conflict(v, v_now);
  end if;

  if v_state = 'paused' then
    update public.sleeps
       set closed_at = public.sleep_last_end(v.segments),
           rev = rev + 1, last_by = auth.uid(), last_action = 'finish',
           last_at = public.sleep_last_end(v.segments)
     where id = v.id
     returning * into v;
  else
    if v_now < public.sleep_last_start(v.segments) then
      return public.sleep_reply('error', v_now, v, jsonb_build_object('code', 'inverted'));
    end if;
    update public.sleeps
       set segments = jsonb_set(
             v.segments,
             array[(jsonb_array_length(v.segments) - 1)::text, 'end'],
             to_jsonb(public.sleep_ts(v_now))
           ),
           closed_at = v_now,
           rev = rev + 1, last_by = auth.uid(), last_action = 'finish', last_at = v_now
     where id = v.id
     returning * into v;
  end if;
  return public.sleep_reply('ok', v_now, v);
end;
$$;

-- Reopen sleep: a finished sleep goes back to paused, its last wake kept.
-- Offered for 3 h after the last wake, and only if no newer sleep exists. A
-- sleep that closed itself (3 h paused) is never reopened.
create function public.reopen_sleep(p_id uuid, p_rev integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.sleep_now();
  v public.sleeps;
begin
  v := public.sleep_lock(p_id);
  if v.id is null or v.deleted_at is not null then
    return public.sleep_reply('gone', v_now);
  end if;
  if v.rev <> p_rev then
    return public.sleep_conflict(v, v_now);
  end if;

  if v.closed_at is null then
    if public.sleep_state(v, v_now) = 'finished' then
      return public.sleep_reply('error', v_now, v,
        jsonb_build_object('code', 'no-reopen', 'reason', 'autoclosed'));
    end if;
    return public.sleep_conflict(v, v_now);
  end if;
  if exists (
    select 1 from public.sleeps o
    where o.baby_id = v.baby_id and o.deleted_at is null and o.id <> v.id
      and o.started_at > v.started_at
  ) then
    return public.sleep_reply('error', v_now, v,
      jsonb_build_object('code', 'no-reopen', 'reason', 'newer'));
  end if;
  if v_now - v.closed_at > interval '3 hours' then
    return public.sleep_reply('error', v_now, v,
      jsonb_build_object('code', 'no-reopen', 'reason', 'expired'));
  end if;

  begin
    update public.sleeps
       set closed_at = null,
           rev = rev + 1, last_by = auth.uid(), last_action = 'reopen', last_at = v.closed_at
     where id = v.id
     returning * into v;
  exception when unique_violation then
    return public.sleep_reply('error', v_now, v,
      jsonb_build_object('code', 'no-reopen', 'reason', 'newer'));
  end;
  return public.sleep_reply('ok', v_now, v);
end;
$$;

-- "Started earlier?" (p_field 'start': the first stretch's start) and "Woke
-- earlier?" (p_field 'end': the last stretch's end, paused sleeps only). The
-- time is either an instant (Pick a time) or minutes before the server's now
-- (How long ago) — the latter so a wrong phone clock can't shift it.
create function public.set_sleep_time(
  p_id uuid,
  p_rev integer,
  p_field text,
  p_at timestamptz default null,
  p_ago_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.sleep_now();
  v public.sleeps;
  v_state text;
  v_at timestamptz;
  v_lo timestamptz;
  v_hi timestamptz;
  v_segs jsonb;
  v_err jsonb;
begin
  if p_field not in ('start', 'end') then
    raise exception 'p_field must be start or end';
  end if;
  if (p_at is null) = (p_ago_minutes is null) then
    raise exception 'Give either a time or minutes ago';
  end if;

  v := public.sleep_lock(p_id);
  if v.id is null or v.deleted_at is not null then
    return public.sleep_reply('gone', v_now);
  end if;
  v_state := public.sleep_state(v, v_now);
  if v.rev <> p_rev or v_state = 'finished' or (p_field = 'end' and v_state <> 'paused') then
    return public.sleep_conflict(v, v_now);
  end if;

  v_at := date_trunc('milliseconds', coalesce(p_at, v_now - p_ago_minutes * interval '1 minute'));
  if v_at > v_now then
    return public.sleep_reply('error', v_now, v, jsonb_build_object('code', 'future'));
  end if;

  if p_field = 'start' then
    -- After the previous sleep ended, and a minute short of this sleep's
    -- first stretch ending (or up to now while it is still running).
    select max(coalesce(o.closed_at, public.sleep_last_end(o.segments))) into v_lo
      from public.sleeps o
     where o.baby_id = v.baby_id and o.deleted_at is null and o.id <> v.id;
    v_hi := coalesce((v.segments -> 0 ->> 'end')::timestamptz - interval '1 minute', v_now);
    if v_lo is not null and v_at < v_lo then
      return public.sleep_reply('error', v_now, v,
        jsonb_build_object('code', 'before-prev', 'limit', public.sleep_ts(v_lo)));
    end if;
    if v_at > v_hi then
      return public.sleep_reply('error', v_now, v,
        jsonb_build_object('code', 'after-end', 'limit', public.sleep_ts(v_hi + interval '1 minute')));
    end if;
    v_segs := jsonb_set(v.segments, '{0,start}', to_jsonb(public.sleep_ts(v_at)));
  else
    v_lo := public.sleep_last_start(v.segments) + interval '1 minute';
    if v_at < v_lo then
      return public.sleep_reply('error', v_now, v, jsonb_build_object('code', 'before-start'));
    end if;
    v_segs := jsonb_set(
      v.segments,
      array[(jsonb_array_length(v.segments) - 1)::text, 'end'],
      to_jsonb(public.sleep_ts(v_at))
    );
  end if;

  v_err := public.sleep_check_segments(v.baby_id, v.id, v_segs, v_now);
  if v_err is not null then
    return public.sleep_reply('error', v_now, v, v_err);
  end if;

  update public.sleeps
     set segments = v_segs,
         rev = rev + 1, last_by = auth.uid(), last_action = 'edit', last_at = v_now
   where id = v.id
   returning * into v;
  return public.sleep_reply('ok', v_now, v);
end;
$$;

-- The × on a sleep card, and "Discard sleep" in the under-a-minute dialog.
-- A soft delete: the row stays for 7 days so Recently Deleted can restore it.
-- A sleep still open is closed as it goes (a running one ends now, a paused or
-- auto-closed one at its last wake), so a restored sleep is a plain finished
-- sleep and never a phantom still running.
create function public.delete_sleep(p_id uuid, p_rev integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.sleep_now();
  v public.sleeps;
  v_state text;
begin
  v := public.sleep_lock(p_id);
  if v.id is null or v.deleted_at is not null then
    return public.sleep_reply('gone', v_now);
  end if;
  if v.rev <> p_rev then
    return public.sleep_conflict(v, v_now);
  end if;

  v_state := public.sleep_state(v, v_now);
  if v.closed_at is not null then
    update public.sleeps
       set deleted_at = v_now, deleted_by = auth.uid(),
           rev = rev + 1, last_by = auth.uid(), last_action = 'delete', last_at = v_now
     where id = v.id
     returning * into v;
  elsif v_state = 'asleep' then
    update public.sleeps
       set segments = jsonb_set(
             v.segments,
             array[(jsonb_array_length(v.segments) - 1)::text, 'end'],
             to_jsonb(public.sleep_ts(v_now))
           ),
           closed_at = v_now,
           deleted_at = v_now, deleted_by = auth.uid(),
           rev = rev + 1, last_by = auth.uid(), last_action = 'delete', last_at = v_now
     where id = v.id
     returning * into v;
  else
    update public.sleeps
       set closed_at = public.sleep_last_end(v.segments),
           deleted_at = v_now, deleted_by = auth.uid(),
           rev = rev + 1, last_by = auth.uid(), last_action = 'delete', last_at = v_now
     where id = v.id
     returning * into v;
  end if;
  return public.sleep_reply('ok', v_now, v);
end;
$$;

-- Restore from Recently Deleted (7 days, as for entries). Refused if the sleep
-- would now overlap one logged since.
create function public.restore_sleep(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.sleep_now();
  v public.sleeps;
  v_err jsonb;
begin
  v := public.sleep_lock(p_id);
  if v.id is null or v.deleted_at is null or v.deleted_at <= v_now - interval '7 days' then
    return public.sleep_reply('gone', v_now);
  end if;

  v_err := public.sleep_check_segments(v.baby_id, v.id, v.segments, v_now);
  if v_err is not null then
    return public.sleep_reply('error', v_now, v, v_err);
  end if;

  update public.sleeps
     set deleted_at = null, deleted_by = null,
         rev = rev + 1, last_by = auth.uid(), last_action = 'restore', last_at = v_now
   where id = v.id
   returning * into v;
  return public.sleep_reply('ok', v_now, v);
end;
$$;

revoke all on function
  public.get_sleeps(uuid, timestamptz), public.start_sleep(uuid, uuid),
  public.pause_sleep(uuid, integer), public.resume_sleep(uuid, integer),
  public.stop_sleep(uuid, integer), public.reopen_sleep(uuid, integer),
  public.set_sleep_time(uuid, integer, text, timestamptz, integer),
  public.delete_sleep(uuid, integer), public.restore_sleep(uuid)
  from public, anon;
grant execute on function
  public.get_sleeps(uuid, timestamptz), public.start_sleep(uuid, uuid),
  public.pause_sleep(uuid, integer), public.resume_sleep(uuid, integer),
  public.stop_sleep(uuid, integer), public.reopen_sleep(uuid, integer),
  public.set_sleep_time(uuid, integer, text, timestamptz, integer),
  public.delete_sleep(uuid, integer), public.restore_sleep(uuid)
  to authenticated;
