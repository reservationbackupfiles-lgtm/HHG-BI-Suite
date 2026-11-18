-- HHG BI Suite: Cloudbeds integration foundation
-- Additive only: references the existing properties.id primary key.
-- Does not modify existing properties, inventory, or historical data.

create table if not exists public.cloudbeds_property_map (
  id bigint generated always as identity primary key,
  hhg_property_id integer not null unique
    references public.properties(id) on update cascade on delete restrict,
  cloudbeds_property_id text unique,
  cloudbeds_property_name text,
  mapping_status text not null default 'pending'
    check (mapping_status in ('pending', 'verified', 'disabled')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cloudbeds_verified_requires_id
    check (mapping_status <> 'verified' or cloudbeds_property_id is not null)
);

create table if not exists public.cloudbeds_sync_log (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  requested_by uuid references auth.users(id) on delete set null,
  hhg_property_id integer references public.properties(id)
    on update cascade on delete set null,
  cloudbeds_property_id text,
  sync_type text not null default 'connection_check',
  endpoint text,
  date_from date,
  date_to date,
  rows_fetched integer not null default 0,
  rows_inserted integer not null default 0,
  rows_updated integer not null default 0,
  status text not null default 'started'
    check (status in ('started', 'success', 'partial', 'failed', 'not_configured')),
  message text,
  created_at timestamptz not null default now()
);

create index if not exists cloudbeds_sync_log_started_at_idx
  on public.cloudbeds_sync_log (started_at desc);
create index if not exists cloudbeds_sync_log_property_idx
  on public.cloudbeds_sync_log (hhg_property_id, started_at desc);

alter table public.cloudbeds_property_map enable row level security;
alter table public.cloudbeds_sync_log enable row level security;

drop policy if exists "admin reads Cloudbeds property map" on public.cloudbeds_property_map;
create policy "admin reads Cloudbeds property map"
  on public.cloudbeds_property_map for select to authenticated
  using (public.is_admin());

drop policy if exists "admin manages Cloudbeds property map" on public.cloudbeds_property_map;
create policy "admin manages Cloudbeds property map"
  on public.cloudbeds_property_map for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin reads Cloudbeds sync log" on public.cloudbeds_sync_log;
create policy "admin reads Cloudbeds sync log"
  on public.cloudbeds_sync_log for select to authenticated
  using (public.is_admin());

-- Sync-log writes are server-side only via the Edge Function service role.
