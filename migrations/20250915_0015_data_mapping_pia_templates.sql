-- Data assets/flows, PIA, policy templates
create table if not exists data_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  system_name text not null,
  data_categories jsonb,
  locations jsonb,
  processors jsonb,
  created_at timestamptz not null default now()
);

create table if not exists data_flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_asset_id uuid references data_assets(id) on delete cascade,
  dest_asset_id uuid references data_assets(id) on delete cascade,
  purpose_id uuid,
  transfer_mechanism text,
  cross_border boolean
);

create table if not exists pia_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  title text not null,
  context jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists pia_findings (
  id uuid primary key default gen_random_uuid(),
  pia_id uuid not null references pia_records(id) on delete cascade,
  category text,
  severity text,
  summary text,
  recommendation text
);

create table if not exists policy_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  title text not null,
  content text not null,
  framework text,
  version text,
  is_global boolean default false,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_assets_org on data_assets (organization_id);
create index if not exists idx_flows_org on data_flows (organization_id);
create index if not exists idx_pia_org on pia_records (organization_id);

-- RLS
alter table data_assets enable row level security;
drop policy if exists data_assets_rls on data_assets;
create policy data_assets_rls on data_assets using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table data_flows enable row level security;
drop policy if exists data_flows_rls on data_flows;
create policy data_flows_rls on data_flows using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table pia_records enable row level security;
drop policy if exists pia_records_rls on pia_records;
create policy pia_records_rls on pia_records using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table policy_templates enable row level security;
drop policy if exists policy_templates_rls on policy_templates;
create policy policy_templates_rls on policy_templates using (organization_id is null or app.allow_org(organization_id)) with check (organization_id is null or app.allow_org(organization_id));


