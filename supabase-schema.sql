-- Secure e-Visa schema for Supabase.
-- Run with a database-owner connection after reviewing the configured admin email.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.evisa_records (
  id uuid primary key default gen_random_uuid(),
  passport_number text not null default '',
  visa_number text not null default '',
  application_code text not null default '',
  status text not null default 'Pending',
  pdf_data_url text,
  buffered boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.evisa_records
  add column if not exists has_pdf boolean
  generated always as (
    pdf_data_url is not null and length(pdf_data_url) > 0
  ) stored;

create table if not exists private.evisa_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

revoke all on table private.evisa_admins from public, anon, authenticated;

-- Seed the existing administrator account without exposing email-based
-- authorization in client code or RLS policies.
insert into private.evisa_admins (user_id)
select id
from auth.users
where lower(email) = lower('alvisa@admin.com')
on conflict (user_id) do nothing;

create or replace function public.is_evisa_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.evisa_admins as admins
      where admins.user_id = (select auth.uid())
    );
$$;

revoke all on function public.is_evisa_admin() from public, anon;
grant execute on function public.is_evisa_admin() to authenticated;

alter table public.evisa_records enable row level security;

drop policy if exists "evisa_records_select" on public.evisa_records;
drop policy if exists "evisa_records_insert" on public.evisa_records;
drop policy if exists "evisa_records_update" on public.evisa_records;
drop policy if exists "evisa_records_delete" on public.evisa_records;
drop policy if exists "evisa_admin_select" on public.evisa_records;
drop policy if exists "evisa_admin_insert" on public.evisa_records;
drop policy if exists "evisa_admin_update" on public.evisa_records;
drop policy if exists "evisa_admin_delete" on public.evisa_records;

revoke all on table public.evisa_records from public, anon;
grant select, insert, update, delete on table public.evisa_records to authenticated;

create policy "evisa_admin_select"
  on public.evisa_records
  for select
  to authenticated
  using ((select public.is_evisa_admin()));

create policy "evisa_admin_insert"
  on public.evisa_records
  for insert
  to authenticated
  with check ((select public.is_evisa_admin()));

create policy "evisa_admin_update"
  on public.evisa_records
  for update
  to authenticated
  using ((select public.is_evisa_admin()))
  with check ((select public.is_evisa_admin()));

create policy "evisa_admin_delete"
  on public.evisa_records
  for delete
  to authenticated
  using ((select public.is_evisa_admin()));

-- Exact-match public lookups. These functions expose only one matching,
-- non-buffered record and avoid granting anonymous SELECT on the table.
create or replace function public.lookup_evisa_by_application_code(
  p_application_code text
)
returns table (
  masked_passport_number text,
  masked_visa_number text,
  application_code text,
  status text,
  has_pdf boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when length(r.passport_number) <= 4 then repeat('*', length(r.passport_number))
      else repeat('*', length(r.passport_number) - 4) || right(r.passport_number, 4)
    end,
    case
      when length(r.visa_number) <= 4 then repeat('*', length(r.visa_number))
      else repeat('*', length(r.visa_number) - 4) || right(r.visa_number, 4)
    end,
    r.application_code,
    r.status,
    r.has_pdf
  from public.evisa_records as r
  where r.buffered = false
    and length(btrim(coalesce(p_application_code, ''))) >= 4
    and lower(btrim(r.application_code)) = lower(btrim(p_application_code))
  order by r.created_at asc, r.id asc
  limit 1;
$$;

create or replace function public.lookup_evisa_by_passport_visa(
  p_passport_number text,
  p_visa_number text
)
returns table (
  passport_number text,
  visa_number text,
  application_code text,
  status text,
  has_pdf boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.passport_number,
    r.visa_number,
    r.application_code,
    r.status,
    r.has_pdf
  from public.evisa_records as r
  where r.buffered = false
    and length(btrim(coalesce(p_passport_number, ''))) >= 4
    and length(btrim(coalesce(p_visa_number, ''))) >= 4
    and lower(btrim(r.passport_number)) = lower(btrim(p_passport_number))
    and lower(btrim(r.visa_number)) = lower(btrim(p_visa_number))
  order by r.created_at asc, r.id asc
  limit 1;
$$;

create or replace function public.get_evisa_pdf_by_application_code(
  p_application_code text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.pdf_data_url
  from public.evisa_records as r
  where r.buffered = false
    and r.has_pdf = true
    and length(btrim(coalesce(p_application_code, ''))) >= 4
    and lower(btrim(r.application_code)) = lower(btrim(p_application_code))
  order by r.created_at asc, r.id asc
  limit 1;
$$;

revoke all on function public.lookup_evisa_by_application_code(text) from public;
revoke all on function public.lookup_evisa_by_passport_visa(text, text) from public;
revoke all on function public.get_evisa_pdf_by_application_code(text) from public;

grant execute on function public.lookup_evisa_by_application_code(text) to anon, authenticated;
grant execute on function public.lookup_evisa_by_passport_visa(text, text) to anon, authenticated;
grant execute on function public.get_evisa_pdf_by_application_code(text) to anon, authenticated;

create index if not exists evisa_records_application_code_lookup_idx
  on public.evisa_records ((lower(btrim(application_code))))
  where buffered = false and application_code <> '';

create index if not exists evisa_records_passport_visa_lookup_idx
  on public.evisa_records (
    (lower(btrim(passport_number))),
    (lower(btrim(visa_number)))
  )
  where buffered = false and passport_number <> '' and visa_number <> '';

commit;
