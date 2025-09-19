-- Data source catalog
create table if not exists data_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  type text not null,
  config jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_data_sources_org on data_sources (organization_id);
alter table data_sources enable row level security;
drop policy if exists data_sources_rls on data_sources;
create policy data_sources_rls on data_sources using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));


