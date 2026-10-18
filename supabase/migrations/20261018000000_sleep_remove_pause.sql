-- Remove one completed pause from a sleep (JOS-78).
--
-- The two stretches either side of the pause become one, so the paused time
-- counts as sleep; the sleep's start and end do not move. `p_index` is the
-- 0-based number of the stretch BEFORE the pause (0 = the first pause), taken
-- from the same `segments` the caller was looking at when it read `p_rev`,
-- so a stale index can never hit a different pause: a changed sleep has a new
-- rev and answers 'conflict'.
--
-- Works on a running or a paused sleep, including one that was just reopened.
-- A finished sleep (closed, or paused past the 3 h auto-close) stays read-only,
-- as JOS-56 decided: Reopen it first. The pause that is still open (after the
-- last stretch) is not removable here; Resume ends it.
create function public.remove_sleep_pause(p_id uuid, p_rev integer, p_index integer)
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
  if v.rev <> p_rev or v_state = 'finished' then
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
         rev = rev + 1, last_by = auth.uid(), last_action = 'edit', last_at = v_now
   where id = v.id
  returning * into v;
  return public.sleep_reply('ok', v_now, v);
end;
$$;

revoke all on function public.remove_sleep_pause(uuid, integer, integer) from public, anon;
grant execute on function public.remove_sleep_pause(uuid, integer, integer) to authenticated;
