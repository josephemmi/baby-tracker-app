-- Invite-code household onboarding: a signed-up user either creates a new
-- household (and gets a code to share) or joins an existing one with a code.

alter table public.households
  add column invite_code text unique not null
  default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

-- Creates a household and attaches the calling user to it as its first member.
create or replace function public.create_household(household_name text, member_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household public.households;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.users where id = auth.uid()) then
    raise exception 'User already belongs to a household';
  end if;

  insert into public.households (name)
  values (household_name)
  returning * into new_household;

  insert into public.users (id, household_id, name, role)
  values (auth.uid(), new_household.id, member_name, 'parent');

  return new_household;
end;
$$;

-- Attaches the calling user to an existing household identified by invite code.
create or replace function public.join_household(code text, member_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household public.households;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.users where id = auth.uid()) then
    raise exception 'User already belongs to a household';
  end if;

  select * into target_household
  from public.households
  where invite_code = upper(code);

  if target_household.id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.users (id, household_id, name, role)
  values (auth.uid(), target_household.id, member_name, 'parent');

  return target_household;
end;
$$;

revoke all on function public.create_household(text, text) from public;
grant execute on function public.create_household(text, text) to authenticated;

revoke all on function public.join_household(text, text) from public;
grant execute on function public.join_household(text, text) to authenticated;
