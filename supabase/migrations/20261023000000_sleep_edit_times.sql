-- Edit times (JOS-103): every time of a sleep and of each pause can be corrected,
-- by either parent, in any state — running, paused or finished.
--
-- What changes, and why:
--
-- * `edit_sleep_times` is the one write for it: the sleep's start and end and the
--   whole list of pauses, replaced in one transaction. Like every sleep write it
--   locks the baby's sleeps, checks `rev` (first write wins: a stale save changes
--   nothing and answers with the latest row), runs every rule again on the
--   server's clock, and bumps `rev`. It sits beside `remove_sleep_pause` (JOS-78)
--   and has the same permissions; the realtime publication already carries the
--   table, so the other phone updates as for any sleep write.
-- * Auto-close is 2 h paused now, not 3 (`sleep_auto_close_after()`, the one place
--   the number lives on this side; src/lib/sleep.ts has AUTO_CLOSE_MS, and the two
--   must agree). It closes AT the moment the pause began, as before. The test is
--   ">=" (exactly 2 h is closed; 1 h 59 min 59 s is still paused).
-- * A sleep the app closed is marked: when `start_sleep` writes the close it also
--   records last_action = 'autoclose' (by nobody, at the 2 h mark), without a new
--   rev, so the card can keep saying "Closed automatically after 2 h paused" after
--   the next sleep has started. Any person's edit replaces that action, which
--   clears the note.
-- * `remove_sleep_pause` no longer refuses a finished sleep ("finished cards are
--   read-only" is reversed), and writes the close it would otherwise only derive.
--   `reopen_sleep` and `set_sleep_time` are no longer called by the app and are
--   left in place for now (a production build from before this release still
--   calls them until it is replaced); a follow-up drops them.
--
-- Stretches are what is stored (`segments`), pauses are the gaps between them,
-- so the function builds the stretches from { start, end, pauses[] }:
--   * end set          -> finished: the last stretch ends there, closed_at = end;
--   * end empty, no pause going -> running: the last stretch is open;
--   * end empty, last pause going -> paused: the last stretch ends where that
--     pause began.
-- Clearing a finished sleep's end therefore brings it back to running, and makes
-- no pause.

/* ---------- 2 h auto-close ---------- */

create function public.sleep_auto_close_after()
returns interval
language sql
immutable
set search_path = public
as $$
  select interval '2 hours';
$$;

-- finished: closed, or paused for sleep_auto_close_after() (it closes itself;
-- closed_at is only written when the next sleep starts, so this is derived on
-- every read).
create or replace function public.sleep_state(s public.sleeps, p_now timestamptz)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when s.closed_at is not null then 'finished'
    when public.sleep_last_end(s.segments) is null then 'asleep'
    when p_now - public.sleep_last_end(s.segments) >= public.sleep_auto_close_after() then 'finished'
    else 'paused'
  end;
$$;

alter table public.sleeps drop constraint sleeps_last_action_check;
alter table public.sleeps add constraint sleeps_last_action_check check (
  last_action in ('start', 'pause', 'resume', 'finish', 'reopen', 'edit', 'delete', 'restore', 'autoclose')
);

-- Writes the close of every sleep of the baby that has closed itself (except
-- `p_except`): at its last wake, by nobody, with the reason on the row. No new
-- rev, because nothing a person was looking at has changed. Called first by
-- anything that must not meet a "still open" sleep that has in fact ended.
create function public.sleep_settle_autoclosed(p_baby_id uuid, p_now timestamptz, p_except uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.sleeps s
     set closed_at = public.sleep_last_end(s.segments),
         last_by = null,
         last_action = 'autoclose',
         last_at = public.sleep_last_end(s.segments) + public.sleep_auto_close_after()
   where s.baby_id = p_baby_id
     and s.closed_at is null
     and s.deleted_at is null
     and s.id is distinct from p_except
     and public.sleep_state(s, p_now) = 'finished';
$$;

revoke all on function public.sleep_auto_close_after(), public.sleep_settle_autoclosed(uuid, timestamptz, uuid)
  from public, anon, authenticated;

-- start_sleep, unchanged except that it closes the sleeps that closed themselves
-- through sleep_settle_autoclosed (which records the reason).
create or replace function public.start_sleep(p_baby_id uuid, p_logged_by uuid default null)
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

  perform public.sleep_settle_autoclosed(p_baby_id, v_now);

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

revoke all on function public.start_sleep(uuid, uuid) from public, anon;
grant execute on function public.start_sleep(uuid, uuid) to authenticated;

/* ---------- Remove a pause: in every state ---------- */

-- Same as before (20261018000000_sleep_remove_pause.sql) except that a finished
-- sleep is no longer refused. A finished sleep keeps its start and end (the last
-- stretch's end is kept); one that had closed itself is written as closed.
create or replace function public.remove_sleep_pause(p_id uuid, p_rev integer, p_index integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.sleep_now();
  v public.sleeps;
  v_state text;
  v_n integer;
  v_next_end jsonb;
  v_segs jsonb;
  v_err jsonb;
begin
  v := public.sleep_lock(p_id);
  if v.id is null or v.deleted_at is not null then
    return public.sleep_reply('gone', v_now);
  end if;
  v_state := public.sleep_state(v, v_now);
  if v.rev <> p_rev then
    return public.sleep_conflict(v, v_now);
  end if;

  v_n := jsonb_array_length(v.segments);
  if p_index is null or p_index < 0 or p_index > v_n - 2 then
    return public.sleep_reply('error', v_now, v, jsonb_build_object('code', 'no-pause'));
  end if;

  -- Stretch p_index absorbs stretch p_index + 1 (keeps its start, takes its
  -- end, which is null while that stretch is still running).
  v_next_end := coalesce(v.segments -> (p_index + 1) -> 'end', 'null'::jsonb);
  select jsonb_agg(
    case when s.ord - 1 = p_index
         then jsonb_build_object('start', s.elem -> 'start', 'end', v_next_end)
         else s.elem end
    order by s.ord)
    into v_segs
    from jsonb_array_elements(v.segments) with ordinality as s(elem, ord)
   where s.ord - 1 <> p_index + 1;

  v_err := public.sleep_check_segments(v.baby_id, v.id, v_segs, v_now);
  if v_err is not null then
    return public.sleep_reply('error', v_now, v, v_err);
  end if;

  update public.sleeps
     set segments = v_segs,
         closed_at = case
           when v.closed_at is null and v_state = 'finished' then public.sleep_last_end(v_segs)
           else v.closed_at end,
         rev = rev + 1, last_by = auth.uid(), last_action = 'edit', last_at = v_now
   where id = v.id
  returning * into v;
  return public.sleep_reply('ok', v_now, v);
end;
$$;

revoke all on function public.remove_sleep_pause(uuid, integer, integer) from public, anon;
grant execute on function public.remove_sleep_pause(uuid, integer, integer) to authenticated;

/* ---------- Edit times ---------- */

-- p_pauses: [{"start": iso, "end": iso | null}, ...] in any order. p_end null
-- means "not finished". `p_rev` is the rev the sheet was opened on.
--
-- Answers (the usual envelope, see sleep_reply):
--   ok            the new row;
--   conflict      stale (someone changed it since p_rev): nothing is written, the
--                 reply carries the latest row and who/when;
--   gone          deleted or never there;
--   open_exists   the edit would bring a sleep back to life while the baby has
--                 another one going (that one is in the reply);
--   error         a rule said no. `code` is:
--                   future      a time is after the server's now        (field)
--                   bad-time    a pause has no start                    (field)
--                   times       rule + field: needs-time, order,
--                               pause-overlap, pause-gap, open-not-last,
--                               open-needs-end
--                   overlap     another sleep is in the way (other = its row)
--                 `field` names the time: 'ss' / 'se' (the sleep's), and
--                 'p<k>s' / 'p<k>e' for the k-th pause (0-based) IN TIME ORDER.
-- Every stretch of sleep and every pause is at least one minute (the same
-- minimum as the live Pause tap).
create function public.edit_sleep_times(
  p_id uuid,
  p_rev integer,
  p_start timestamptz,
  p_end timestamptz,
  p_pauses jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.sleep_now();
  v_min constant interval := interval '1 minute';
  v public.sleeps;
  v_start timestamptz := date_trunc('milliseconds', p_start);
  v_end timestamptz := date_trunc('milliseconds', p_end);
  v_ps jsonb;
  v_n integer;
  v_k integer;
  v_cur timestamptz;
  v_cur_end timestamptz;
  v_prev_end timestamptz;
  v_segs jsonb := '[]'::jsonb;
  v_from timestamptz;
  v_closed timestamptz;
  v_err jsonb;
  v_other public.sleeps;
begin
  v := public.sleep_lock(p_id);
  if v.id is null or v.deleted_at is not null then
    return public.sleep_reply('gone', v_now);
  end if;
  if v.rev <> p_rev then
    return public.sleep_reply('conflict', v_now, v, jsonb_build_object('reason', 'stale'));
  end if;

  if v_start is null then
    return public.sleep_reply('error', v_now, v,
      jsonb_build_object('code', 'times', 'rule', 'needs-time', 'field', 'ss'));
  end if;

  -- The pauses, in time order. A pause with no start is not a pause.
  p_pauses := coalesce(p_pauses, '[]'::jsonb);
  if jsonb_typeof(p_pauses) is distinct from 'array' then
    return public.sleep_reply('error', v_now, v,
      jsonb_build_object('code', 'times', 'rule', 'needs-time', 'field', 'p0s'));
  end if;
  v_n := jsonb_array_length(p_pauses);
  for v_k in 0 .. v_n - 1 loop
    if (p_pauses -> v_k ->> 'start') is null then
      return public.sleep_reply('error', v_now, v,
        jsonb_build_object('code', 'times', 'rule', 'needs-time', 'field', 'p' || v_k || 's'));
    end if;
  end loop;
  select coalesce(jsonb_agg(
           jsonb_build_object('start', public.sleep_ts(date_trunc('milliseconds', (e ->> 'start')::timestamptz)),
                              'end', case when (e ->> 'end') is null then null
                                          else public.sleep_ts(date_trunc('milliseconds', (e ->> 'end')::timestamptz)) end)
           order by (e ->> 'start')::timestamptz, (e ->> 'end')::timestamptz nulls last), '[]'::jsonb)
    into v_ps
    from jsonb_array_elements(p_pauses) as t(e);

  -- Nothing in the future.
  if v_start > v_now then
    return public.sleep_reply('error', v_now, v, jsonb_build_object('code', 'future', 'field', 'ss'));
  end if;
  if v_end is not null and v_end > v_now then
    return public.sleep_reply('error', v_now, v, jsonb_build_object('code', 'future', 'field', 'se'));
  end if;
  -- The sleep is at least a minute long.
  if v_end is not null and v_end - v_start < v_min then
    return public.sleep_reply('error', v_now, v,
      jsonb_build_object('code', 'times', 'rule', 'order', 'field', 'se'));
  end if;

  v_from := v_start;
  v_prev_end := null;
  for v_k in 0 .. v_n - 1 loop
    v_cur := (v_ps -> v_k ->> 'start')::timestamptz;
    v_cur_end := (v_ps -> v_k ->> 'end')::timestamptz;

    if v_cur > v_now then
      return public.sleep_reply('error', v_now, v,
        jsonb_build_object('code', 'future', 'field', 'p' || v_k || 's'));
    end if;
    if v_cur_end is not null and v_cur_end > v_now then
      return public.sleep_reply('error', v_now, v,
        jsonb_build_object('code', 'future', 'field', 'p' || v_k || 'e'));
    end if;

    -- Sleep for at least a minute before the pause (after the sleep start, or
    -- after the previous pause).
    if v_prev_end is null then
      if v_cur - v_start < v_min then
        return public.sleep_reply('error', v_now, v,
          jsonb_build_object('code', 'times', 'rule', 'order', 'field', 'p' || v_k || 's'));
      end if;
    elsif v_cur < v_prev_end then
      return public.sleep_reply('error', v_now, v,
        jsonb_build_object('code', 'times', 'rule', 'pause-overlap', 'field', 'p' || v_k || 's'));
    elsif v_cur - v_prev_end < v_min then
      return public.sleep_reply('error', v_now, v,
        jsonb_build_object('code', 'times', 'rule', 'pause-gap', 'field', 'p' || v_k || 's'));
    end if;

    if v_cur_end is null then
      if v_k < v_n - 1 then
        return public.sleep_reply('error', v_now, v,
          jsonb_build_object('code', 'times', 'rule', 'open-not-last', 'field', 'p' || v_k || 'e'));
      end if;
      if v_end is not null then
        return public.sleep_reply('error', v_now, v,
          jsonb_build_object('code', 'times', 'rule', 'open-needs-end', 'field', 'p' || v_k || 'e'));
      end if;
    else
      -- The pause is at least a minute, and ends a minute before the sleep does.
      if v_cur_end - v_cur < v_min then
        return public.sleep_reply('error', v_now, v,
          jsonb_build_object('code', 'times', 'rule', 'order', 'field', 'p' || v_k || 'e'));
      end if;
      if v_end is not null and v_end - v_cur_end < v_min then
        return public.sleep_reply('error', v_now, v,
          jsonb_build_object('code', 'times', 'rule', 'order', 'field', 'se'));
      end if;
    end if;

    v_segs := v_segs || jsonb_build_array(
      jsonb_build_object('start', public.sleep_ts(v_from), 'end', public.sleep_ts(v_cur)));
    if v_cur_end is null then
      v_from := null;               -- the pause is still going: no stretch after it
    else
      v_from := v_cur_end;
      v_prev_end := v_cur_end;
    end if;
  end loop;

  -- The last stretch: to the sleep's end, or still open (running).
  if v_from is not null then
    v_segs := v_segs || jsonb_build_array(
      jsonb_build_object('start', public.sleep_ts(v_from),
                         'end', case when v_end is null then null else public.sleep_ts(v_end) end));
  end if;

  -- The rules every sleep write has: well-formed, in order, not in the future,
  -- and no overlap with any other live sleep (a running one included; touching
  -- is allowed).
  v_err := public.sleep_check_segments(v.baby_id, v.id, v_segs, v_now);
  if v_err is not null then
    return public.sleep_reply('error', v_now, v, v_err);
  end if;

  -- A sleep that closed itself is not "open" any more; an edit that leaves one
  -- paused past the auto-close is written as closed, so it never blocks a start.
  v_closed := v_end;
  if v_end is null and v_from is null
     and v_now - (v_segs -> -1 ->> 'end')::timestamptz >= public.sleep_auto_close_after() then
    v_closed := (v_segs -> -1 ->> 'end')::timestamptz;
  end if;

  -- Bringing a sleep back to life is only possible while the baby has no other
  -- sleep going (one that closed itself does not count).
  if v_closed is null then
    perform public.sleep_settle_autoclosed(v.baby_id, v_now, v.id);
  end if;

  begin
    update public.sleeps
       set segments = v_segs,
           closed_at = v_closed,
           rev = rev + 1, last_by = auth.uid(), last_action = 'edit', last_at = v_now
     where id = v.id
    returning * into v;
  exception when unique_violation then
    select * into v_other from public.sleeps s
     where s.baby_id = v.baby_id and s.closed_at is null and s.deleted_at is null and s.id <> v.id;
    return public.sleep_reply('open_exists', v_now, v_other);
  end;
  return public.sleep_reply('ok', v_now, v);
end;
$$;

revoke all on function public.edit_sleep_times(uuid, integer, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.edit_sleep_times(uuid, integer, timestamptz, timestamptz, jsonb) to authenticated;
