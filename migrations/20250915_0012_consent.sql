-- Consent management tables with RLS
create table if not exists consent_purposes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  description text,
  retention_days integer,
  legal_basis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists consent_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  subject_hash text not null,
  purpose_id uuid not null references consent_purposes(id) on delete cascade,
  granted boolean not null,
  method text,
  timestamp timestamptz not null default now(),
  expiry_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists consent_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  consent_id uuid references consent_records(id) on delete set null,
  action text not null,
  actor_user_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cp_org on consent_purposes (organization_id);
create index if not exists idx_cr_org_subject on consent_records (organization_id, subject_hash);
create index if not exists idx_cr_purpose on consent_records (purpose_id);
create index if not exists idx_ca_org_created on consent_audits (organization_id, created_at desc);

-- RLS policies
alter table consent_purposes enable row level security;
drop policy if exists consent_purposes_rls on consent_purposes;
create policy consent_purposes_rls on consent_purposes using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table consent_records enable row level security;
drop policy if exists consent_records_rls on consent_records;
create policy consent_records_rls on consent_records using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table consent_audits enable row level security;
drop policy if exists consent_audits_rls on consent_audits;
create policy consent_audits_rls on consent_audits using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));


