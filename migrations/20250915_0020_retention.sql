-- Retention and erasure workflow
create table if not exists retention_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_type text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  details jsonb
);

create table if not exists retention_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity text not null,
  ref_id text,
  action text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_retention_jobs_org on retention_jobs (organization_id, started_at desc);
create index if not exists idx_retention_audits_org on retention_audits (organization_id, created_at desc);

alter table retention_jobs enable row level security;
drop policy if exists retention_jobs_rls on retention_jobs;
create policy retention_jobs_rls on retention_jobs using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table retention_audits enable row level security;
drop policy if exists retention_audits_rls on retention_audits;
create policy retention_audits_rls on retention_audits using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));


