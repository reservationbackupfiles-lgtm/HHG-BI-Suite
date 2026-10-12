-- HHG BI SUITE : user management. Run once AFTER schema.sql (Supabase > SQL Editor).
-- Adds: active flag and an optional date window per user, enforced by the database.

alter table profiles add column if not exists active boolean not null default true;
alter table profiles add column if not exists view_from date;   -- null = no start limit
alter table profiles add column if not exists view_to date;     -- null = no end limit

-- admins can read and edit every profile (role, window, active)
create policy "admin manages profiles" on profiles for all to authenticated
  using (is_admin()) with check (is_admin());

-- true when the signed-in user is active and the date (range) falls inside their window. Admins always pass.
create or replace function can_see(a date, b date default null) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.active and (p.role = 'admin' or (
      (p.view_from is null or coalesce(b, a) >= p.view_from) and (p.view_to is null or a <= p.view_to)))
    from profiles p where p.id = auth.uid()), false)
$$;

drop policy if exists "read monthly_adr"  on monthly_adr;
drop policy if exists "read reservations" on reservations;
drop policy if exists "read pace"         on pace;
create policy "read monthly_adr"  on monthly_adr  for select to authenticated
  using (can_see(make_date(year, month, 1), (make_date(year, month, 1) + interval '1 month - 1 day')::date));
create policy "read reservations" on reservations for select to authenticated using (can_see(booking_date));
create policy "read pace"         on pace         for select to authenticated using (can_see(snapshot_date));

-- Add users in Authentication > Users (Add user / Invite). They appear as viewers automatically.
