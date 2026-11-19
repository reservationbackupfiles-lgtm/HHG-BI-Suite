-- Additive Rate Management tables. Does not modify existing BI tables.
create table if not exists public.rate_floor_rules (
 id uuid primary key default gen_random_uuid(), property_id bigint not null references public.properties(id) on delete cascade,
 room_type text not null, season text not null, meal_plan text, effective_from date not null default date '1900-01-01', effective_to date,
 floor_rate numeric(12,2) not null check(floor_rate>0), ceiling_rate numeric(12,2) check(ceiling_rate is null or ceiling_rate>=floor_rate),
 approval_status text not null default 'Draft' check(approval_status in ('Draft','Approved')), source_file text, notes text,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
 unique(property_id,room_type,season,meal_plan,effective_from)
);
create table if not exists public.rate_plans (
 id uuid primary key default gen_random_uuid(), property_id bigint not null references public.properties(id) on delete cascade,
 name text not null, room_type text, meal_plan text, cancellation_policy text, derived_from text, active boolean not null default true,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.rate_calendar (
 id uuid primary key default gen_random_uuid(), property_id bigint not null references public.properties(id) on delete cascade,
 room_type text not null, stay_date date not null, rate_plan_name text not null default 'BAR', rate numeric(12,2) not null check(rate>0),
 currency text not null default 'PHP', source text not null default 'manual', updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
 unique(property_id,room_type,stay_date,rate_plan_name)
);
create table if not exists public.rate_change_log (
 id uuid primary key default gen_random_uuid(), property_id bigint not null references public.properties(id) on delete cascade,
 room_type text not null, stay_date date, old_rate numeric(12,2), new_rate numeric(12,2) not null, action text not null,
 user_email text, changed_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create index if not exists rate_calendar_lookup_idx on public.rate_calendar(property_id,stay_date,room_type);
create index if not exists rate_floor_lookup_idx on public.rate_floor_rules(property_id,room_type,approval_status);
create index if not exists rate_change_history_idx on public.rate_change_log(property_id,created_at desc);
alter table public.rate_floor_rules enable row level security;
alter table public.rate_plans enable row level security;
alter table public.rate_calendar enable row level security;
alter table public.rate_change_log enable row level security;
do $$ begin create policy rate_floor_read_authenticated on public.rate_floor_rules for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy rate_floor_admin_write on public.rate_floor_rules for all to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')) with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')); exception when duplicate_object then null; end $$;
do $$ begin create policy rate_plans_read_authenticated on public.rate_plans for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy rate_plans_admin_write on public.rate_plans for all to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')) with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')); exception when duplicate_object then null; end $$;
do $$ begin create policy rate_calendar_read_authenticated on public.rate_calendar for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy rate_calendar_admin_write on public.rate_calendar for all to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')) with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')); exception when duplicate_object then null; end $$;
do $$ begin create policy rate_log_read_authenticated on public.rate_change_log for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy rate_log_admin_insert on public.rate_change_log for insert to authenticated with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')); exception when duplicate_object then null; end $$;
grant select,insert,update,delete on public.rate_floor_rules,public.rate_plans,public.rate_calendar to authenticated;
grant select,insert on public.rate_change_log to authenticated;
