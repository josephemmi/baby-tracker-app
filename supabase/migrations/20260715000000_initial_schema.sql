-- Initial schema: households, users, babies, entries.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Mirrors auth.users; one row per household member.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  role text not null default 'parent' check (role in ('parent', 'caregiver')),
  created_at timestamptz not null default now()
);

create table public.babies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  date_of_birth date not null,
  created_at timestamptz not null default now()
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  logged_by uuid references public.users (id) on delete set null,
  type text not null check (type in ('feed', 'pee', 'poop')),
  timestamp timestamptz not null default now(),
  notes text,
  amount_ml numeric(6, 1) check (amount_ml is null or amount_ml >= 0),
  created_at timestamptz not null default now()
);

-- Fast "last feed" lookups and day-grouped timeline queries.
create index entries_baby_id_timestamp_idx on public.entries (baby_id, timestamp desc);
create index entries_baby_id_type_timestamp_idx on public.entries (baby_id, type, timestamp desc);
create index users_household_id_idx on public.users (household_id);
create index babies_household_id_idx on public.babies (household_id);

-- Returns the household of the currently authenticated user.
-- security definer avoids RLS recursion when policies below query public.users.
create function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.users where id = auth.uid();
$$;

alter table public.households enable row level security;
alter table public.users enable row level security;
alter table public.babies enable row level security;
alter table public.entries enable row level security;

create policy "Members can view their household" on public.households
  for select using (id = public.current_household_id());

create policy "Members can view their household's users" on public.users
  for select using (household_id = public.current_household_id());

create policy "Members can update their own profile" on public.users
  for update using (id = auth.uid());

create policy "Members can view their household's babies" on public.babies
  for select using (household_id = public.current_household_id());

create policy "Members can manage their household's babies" on public.babies
  for insert with check (household_id = public.current_household_id());

create policy "Members can update their household's babies" on public.babies
  for update using (household_id = public.current_household_id());

create policy "Members can view their household's entries" on public.entries
  for select using (
    baby_id in (
      select id from public.babies where household_id = public.current_household_id()
    )
  );

create policy "Members can create entries for their household's babies" on public.entries
  for insert with check (
    baby_id in (
      select id from public.babies where household_id = public.current_household_id()
    )
  );

create policy "Members can update their household's entries" on public.entries
  for update using (
    baby_id in (
      select id from public.babies where household_id = public.current_household_id()
    )
  );

create policy "Members can delete their household's entries" on public.entries
  for delete using (
    baby_id in (
      select id from public.babies where household_id = public.current_household_id()
    )
  );
