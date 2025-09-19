-- DPIA (Data Protection Impact Assessment) core tables with RLS
create table if not exists dpia_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_name text not null,
  description text,
  lawful_basis text,
  high_risk boolean default false,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists dpia_findings (
  id uuid primary key default gen_random_uuid(),
  dpia_id uuid not null references dpia_records(id) on delete cascade,
  category text not null,
  severity text not null,
  summary text not null,
  recommendation text,
  references jsonb,
  created_at timestamptz not null default now()
);

create table if not exists dpia_approvals (
  id uuid primary key default gen_random_uuid(),
  dpia_id uuid not null references dpia_records(id) on delete cascade,
  approver_user_id uuid not null,
  decision text not null,
  comment text,
  decided_at timestamptz not null default now()
);

create index if not exists idx_dpia_org_status on dpia_records (organization_id, status);
create index if not exists idx_dpia_findings_dpia on dpia_findings (dpia_id);
create index if not exists idx_dpia_approvals_dpia on dpia_approvals (dpia_id);

-- RLS
alter table dpia_records enable row level security;
drop policy if exists dpia_records_rls on dpia_records;
create policy dpia_records_rls on dpia_records using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table dpia_findings enable row level security;
drop policy if exists dpia_findings_rls on dpia_findings;
create policy dpia_findings_rls on dpia_findings using (
  exists (select 1 from dpia_records d where d.id = dpia_findings.dpia_id and app.allow_org(d.organization_id))
) with check (
  exists (select 1 from dpia_records d where d.id = dpia_findings.dpia_id and app.allow_org(d.organization_id))
);

alter table dpia_approvals enable row level security;
drop policy if exists dpia_approvals_rls on dpia_approvals;
create policy dpia_approvals_rls on dpia_approvals using (
  exists (select 1 from dpia_records d where d.id = dpia_approvals.dpia_id and app.allow_org(d.organization_id))
) with check (
  exists (select 1 from dpia_records d where d.id = dpia_approvals.dpia_id and app.allow_org(d.organization_id))
);


