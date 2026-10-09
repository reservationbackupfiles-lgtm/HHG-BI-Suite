-- HHG BI Suite — Supabase schema. Run once in: Supabase dashboard → SQL Editor.
create table if not exists properties (
  id serial primary key,
  name text unique not null,
  rooms int not null default 0,
  sort int not null default 0
);

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  role text not null default 'viewer' check (role in ('admin','viewer'))
);

-- ADR report: one row per property per stay date
create table if not exists adr_daily (
  property_id int not null references properties on delete cascade,
  stay_date date not null,
  rooms_sold int not null default 0,
  rooms_available int not null default 0,
  room_revenue numeric not null default 0,
  primary key (property_id, stay_date)
);

-- Pace report: one row per upload day (snapshot) per stay date
create table if not exists pace_snapshots (
  property_id int not null references properties on delete cascade,
  snapshot_date date not null,
  stay_date date not null,
  room_nights int not null default 0,
  primary key (property_id, snapshot_date, stay_date)
);

-- Reservations by booking date
create table if not exists reservations (
  id bigserial primary key,
  property_id int not null references properties on delete cascade,
  reservation_no text,
  booking_date date,
  check_in date,
  check_out date,
  nights int not null default 0,
  revenue numeric not null default 0,
  status text not null default 'Confirmed',   -- 'Cancelled' counts as cancelled
  source text,
  unique (property_id, reservation_no)
);

-- Optional admin-entered target for next-year forecast (property_id null = all)
create table if not exists targets (
  id serial primary key,
  year int not null,
  property_id int references properties on delete cascade,
  room_revenue numeric not null default 0
);

create table if not exists upload_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_email text,
  property_id int references properties on delete set null,
  report text not null,
  rows int,
  result text not null,       -- 'Saved' | 'Error'
  message text
);

create index if not exists res_checkin on reservations (check_in);
create index if not exists adr_date on adr_daily (stay_date);
create index if not exists pace_stay on pace_snapshots (stay_date);

-- Auto-create a viewer profile on sign-up
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

-- Row-level security: signed-in users read; only admins write
do $$
declare t text;
begin
  foreach t in array array['properties','adr_daily','pace_snapshots','reservations','targets','upload_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "read %1$s" on %1$I', t);
    execute format('create policy "read %1$s" on %1$I for select to authenticated using (true)', t);
    execute format('drop policy if exists "write %1$s" on %1$I', t);
    execute format('create policy "write %1$s" on %1$I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;
alter table profiles enable row level security;
drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles for select to authenticated using (id = auth.uid() or is_admin());

insert into properties (name, rooms, sort) values
 ('H Hotel',41,1),('J Boutique Hotel',24,2),('Nacpan Beach Glamping',20,3),('Nacpan Beach Resort',36,4),
 ('Nacpan Beach Villas',12,5),('Piece Lio',36,6),('S Resort',45,7),('Z Garden Hotel',30,8),('Villa V',6,9)
on conflict (name) do nothing;

-- Make yourself admin after signing up once:
-- update profiles set role = 'admin' where email = 'hanszpaul@gmail.com';
