create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  org text not null,
  email text not null unique,
  role text not null default 'Fleet Operator',
  sector text not null check (sector in ('wind', 'solar')),
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected')),
  avatar_url text,
  phone text,
  bio text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_data (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.app_data enable row level security;

revoke all on public.profiles, public.app_data from anon, authenticated;
grant all on public.profiles, public.app_data to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view profile avatars" on storage.objects;
create policy "Public can view profile avatars"
on storage.objects for select
to public
using (bucket_id = 'profile-avatars');

-- Create the initial administrator in Supabase Authentication first, then replace the
-- email below and run this statement. Never place a password or service-role key here.
-- insert into public.profiles (id, first_name, last_name, org, email, role, sector, status)
-- select id, 'CompliQ', 'Admin', 'REUDE Technologies', email, 'Administrator', 'wind', 'active'
-- from auth.users where lower(email) = lower('admin@example.com')
-- on conflict (id) do update
-- set role = excluded.role, status = excluded.status, sector = excluded.sector;

-- Automatically create a profile for every new Supabase Auth user.
-- Public sign-ups can never assign themselves the Administrator role.
create or replace function public.handle_new_compliq_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
  requested_sector text;
begin
  requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'Fleet Operator');
  if requested_role not in ('Fleet Operator', 'Maintenance Engineer', 'Data Analyst', 'Site Manager') then
    requested_role := 'Fleet Operator';
  end if;

  requested_sector := coalesce(new.raw_user_meta_data ->> 'sector', 'wind');
  if requested_sector not in ('wind', 'solar') then
    requested_sector := 'wind';
  end if;

  insert into public.profiles
    (id, first_name, last_name, org, email, role, sector, status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), 'New'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''), 'User'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'org'), ''), 'Not provided'),
    coalesce(new.email, new.id::text || '@unknown.invalid'),
    requested_role,
    requested_sector,
    'pending'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_compliq_auth_user_created on auth.users;
create trigger on_compliq_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_compliq_user();

-- Backfill existing Auth users that do not yet have a profile.
-- Existing profiles (including configured administrators) are left unchanged.
insert into public.profiles
  (id, first_name, last_name, org, email, role, sector, status)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'first_name'), ''), 'New'),
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'last_name'), ''), 'User'),
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'org'), ''), 'Not provided'),
  coalesce(u.email, u.id::text || '@unknown.invalid'),
  case
    when u.raw_user_meta_data ->> 'role' in ('Fleet Operator', 'Maintenance Engineer', 'Data Analyst', 'Site Manager')
      then u.raw_user_meta_data ->> 'role'
    else 'Fleet Operator'
  end,
  case when u.raw_user_meta_data ->> 'sector' in ('wind', 'solar')
    then u.raw_user_meta_data ->> 'sector'
    else 'wind'
  end,
  'pending'
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;
