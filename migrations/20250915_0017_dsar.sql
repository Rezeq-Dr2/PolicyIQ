-- DSAR (Subject Access Request) tables with RLS
create table if not exists dsar_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  subject_hash text not null,
  status text not null default 'open',
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists dsar_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references dsar_requests(id) on delete cascade,
  source text not null,
  ref_id text,
  content jsonb not null,
  redacted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_dsar_org_status on dsar_requests (organization_id, status);
create index if not exists idx_dsar_items_request on dsar_items (request_id);

alter table dsar_requests enable row level security;
drop policy if exists dsar_requests_rls on dsar_requests;
create policy dsar_requests_rls on dsar_requests using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table dsar_items enable row level security;
drop policy if exists dsar_items_rls on dsar_items;
create policy dsar_items_rls on dsar_items using (
  exists (select 1 from dsar_requests r where r.id = dsar_items.request_id and app.allow_org(r.organization_id))
) with check (
  exists (select 1 from dsar_requests r where r.id = dsar_items.request_id and app.allow_org(r.organization_id))
);


