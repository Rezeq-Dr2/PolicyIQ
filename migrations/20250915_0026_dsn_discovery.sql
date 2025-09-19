create table if not exists discovery_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_found integer not null default 0,
  details jsonb
);

create index if not exists idx_discovery_runs_org on discovery_runs (organization_id, started_at desc);

create table if not exists data_source_metadata (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  key text not null,
  value jsonb,
  discovered_at timestamptz not null default now()
);

create index if not exists idx_dsm_source on data_source_metadata (source_id, discovered_at desc);


