-- HHG BI SUITE : run once in Supabase > SQL Editor

create table if not exists properties (
  code text primary key, name text not null,
  total_rooms int not null default 0, active boolean not null default true
);
insert into properties (code, name, total_rooms) values
  ('HHO','H Hotel',41), ('HSR','S Resort',45), ('PCL','Piece Lio',36),
  ('NBR','Nacpan Beach Resort',26), ('NBG','Nacpan Beach Glamping',19),
  ('NBV','Nacpan Beach Villas',15), ('JBH','J Boutique Hotel',14),
  ('HZG','Z Garden Hotel',28),
  ('VV','Villa V',39)  -- TODO: set the real code and room count
on conflict (code) do nothing;

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text, role text not null default 'viewer' check (role in ('admin','viewer'))
);
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into profiles (id, email) values (new.id, new.email) on conflict do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
create or replace function is_admin() returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- ADR report: one row per property / year / month
create table if not exists monthly_adr (
  property text not null references properties(code), year int not null, month int not null check (month between 1 and 12),
  rooms_sold numeric, room_revenue numeric, adr numeric, updated_at timestamptz default now(),
  primary key (property, year, month)
);

-- Reservations by Booking Date
create table if not exists reservations (
  id bigint generated always as identity primary key,
  property text not null references properties(code),
  reservation_no text, booking_date date, status text, room_type text, source text, source_category text,
  check_in date, check_out date, room_nights numeric, guests numeric,
  suggested_deposit numeric, grand_total numeric, room_revenue numeric, taxes numeric, paid numeric, balance_due numeric
);
create index if not exists reservations_prop_booking on reservations (property, booking_date);

-- Pace Report: one snapshot per property per upload date (history is kept)
create table if not exists pace (
  property text not null references properties(code), snapshot_date date not null, month_no int not null, day int not null,
  ty_rooms_sold numeric, ty_room_revenue numeric, ty_capacity numeric,
  ly_rooms_sold numeric, ly_room_revenue numeric, ly_capacity numeric,
  primary key (property, snapshot_date, month_no, day)
);
-- month totals per snapshot: what the Pace screen reads
create or replace view pace_monthly with (security_invoker = true) as
  select property, snapshot_date, month_no,
         sum(ty_rooms_sold) ty_rooms_sold, sum(ty_room_revenue) ty_room_revenue, sum(ty_capacity) ty_capacity,
         sum(ly_rooms_sold) ly_rooms_sold, sum(ly_room_revenue) ly_room_revenue, sum(ly_capacity) ly_capacity
  from pace group by property, snapshot_date, month_no;

-- Every upload is logged: who, when, which property and report, rows, result
create table if not exists upload_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_email text, property text references properties(code), report text,
  rows_saved int, status text, message text, snapshot_date date
);

-- Row level security: signed-in users read, only admins write
alter table properties enable row level security;  alter table profiles enable row level security;
alter table monthly_adr enable row level security; alter table reservations enable row level security;
alter table pace enable row level security;        alter table upload_log enable row level security;

create policy "own profile or admin" on profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy "admin reads log" on upload_log for select to authenticated using (is_admin());
create policy "admin writes log" on upload_log for insert to authenticated with check (is_admin());
do $$ declare t text; begin
  foreach t in array array['properties','monthly_adr','reservations','pace'] loop
    execute format('create policy "read %1$s" on %1$s for select to authenticated using (true)', t);
    execute format('create policy "admin write %1$s" on %1$s for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- After creating your own user (Authentication > Users), make yourself admin:
-- update profiles set role = 'admin' where email = 'you@example.com';
