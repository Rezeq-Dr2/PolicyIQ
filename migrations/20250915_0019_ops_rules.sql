-- Breach rules, anomaly events, evidence collectors
create table if not exists breach_rules (
  id uuid primary key default gen_random_uuid(),
  regulator text not null,
  deadline_hours integer not null,
  template text,
  unique (regulator)
);

create table if not exists anomaly_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  kind text not null,
  severity text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_anomaly_org_created on anomaly_events (organization_id, created_at desc);

create table if not exists collectors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  type text not null,
  config jsonb not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists collector_runs (
  id uuid primary key default gen_random_uuid(),
  collector_id uuid not null references collectors(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'pending',
  result jsonb
);

alter table anomaly_events enable row level security;
drop policy if exists anomaly_events_rls on anomaly_events;
create policy anomaly_events_rls on anomaly_events using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table collectors enable row level security;
drop policy if exists collectors_rls on collectors;
create policy collectors_rls on collectors using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));


