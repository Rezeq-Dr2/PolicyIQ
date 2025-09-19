-- Big Bets: scenarios, models registry, active learning, framework mappings
create table if not exists scenario_simulations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  hypothesis jsonb not null,
  baseline jsonb not null,
  projected jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists finetuned_models (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  provider text not null,
  base_model text not null,
  model_name text not null,
  dataset_ref text,
  status text not null default 'registered',
  created_at timestamptz not null default now()
);

create table if not exists user_feedback_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  report_id uuid,
  analysis_id uuid,
  label text not null,
  rationale text,
  created_at timestamptz not null default now()
);

create table if not exists framework_mapping_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  framework_name text not null,
  input_controls jsonb not null,
  mapping jsonb not null,
  coverage_percent numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_scenarios_org_created on scenario_simulations (organization_id, created_at desc);
create index if not exists idx_feedback_org_created on user_feedback_events (organization_id, created_at desc);
create index if not exists idx_mapping_org_created on framework_mapping_runs (organization_id, created_at desc);

-- RLS aligning with app.allow_org
alter table scenario_simulations enable row level security;
drop policy if exists scenario_simulations_rls on scenario_simulations;
create policy scenario_simulations_rls on scenario_simulations using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table finetuned_models enable row level security;
drop policy if exists finetuned_models_rls on finetuned_models;
create policy finetuned_models_rls on finetuned_models using (organization_id is null or app.allow_org(organization_id)) with check (organization_id is null or app.allow_org(organization_id));

alter table user_feedback_events enable row level security;
drop policy if exists user_feedback_events_rls on user_feedback_events;
create policy user_feedback_events_rls on user_feedback_events using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table framework_mapping_runs enable row level security;
drop policy if exists framework_mapping_runs_rls on framework_mapping_runs;
create policy framework_mapping_runs_rls on framework_mapping_runs using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));


