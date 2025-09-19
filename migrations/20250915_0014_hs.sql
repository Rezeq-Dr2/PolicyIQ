-- Health & Safety: risk assessments, incidents, training
create table if not exists hs_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  activity text not null,
  location text,
  assessor_user_id uuid,
  date date,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists hs_risk_findings (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references hs_risk_assessments(id) on delete cascade,
  hazard text not null,
  likelihood text not null,
  severity text not null,
  risk_score integer not null,
  control_measures text
);

create table if not exists hs_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  occurred_at timestamptz not null,
  location text,
  description text,
  injured boolean,
  status text not null default 'open',
  severity text
);

create table if not exists hs_incident_actions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references hs_incidents(id) on delete cascade,
  action text not null,
  assignee_user_id uuid,
  due_at timestamptz,
  completed_at timestamptz
);

create table if not exists trainings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  title text not null,
  type text,
  validity_days integer
);

create table if not exists training_assignments (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings(id) on delete cascade,
  user_id uuid not null,
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  status text not null default 'assigned'
);

create table if not exists training_completions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references training_assignments(id) on delete cascade,
  completed_at timestamptz not null default now(),
  score integer
);

-- Indexes
create index if not exists idx_hs_ra_org on hs_risk_assessments (organization_id);
create index if not exists idx_hs_inc_org on hs_incidents (organization_id);
create index if not exists idx_trainings_org on trainings (organization_id);

-- RLS
alter table hs_risk_assessments enable row level security;
drop policy if exists hs_risk_assessments_rls on hs_risk_assessments;
create policy hs_risk_assessments_rls on hs_risk_assessments using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table hs_incidents enable row level security;
drop policy if exists hs_incidents_rls on hs_incidents;
create policy hs_incidents_rls on hs_incidents using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table trainings enable row level security;
drop policy if exists trainings_rls on trainings;
create policy trainings_rls on trainings using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

-- child tables inherit via parent check-through joins

