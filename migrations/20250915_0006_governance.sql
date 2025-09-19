-- Governance workflows: tasks, approvals/SLAs, attestations, evidence

begin;

-- Tasks
create table if not exists workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  title varchar(255) not null,
  description text,
  status varchar(30) not null default 'open', -- open|in_progress|blocked|completed|cancelled
  due_date timestamp,
  sla_hours integer, -- target to complete
  assignee_user_id varchar(255),
  created_by varchar(255),
  created_at timestamp default now(),
  updated_at timestamp default now()
);
create index if not exists idx_tasks_org_status on workflow_tasks (organization_id, status);

-- Approvals per task
create table if not exists task_approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references workflow_tasks(id) on delete cascade,
  approver_user_id varchar(255) not null,
  status varchar(20) not null default 'pending', -- pending|approved|rejected
  note text,
  approved_at timestamp,
  created_at timestamp default now()
);
create index if not exists idx_task_approvals_task on task_approvals (task_id);

-- Evidence items (linked to task or report)
create table if not exists evidence_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  task_id uuid references workflow_tasks(id) on delete set null,
  report_id uuid references compliance_reports(id) on delete set null,
  kind varchar(20) not null default 'note', -- note|url|file
  content text, -- note text or URL; for files, store path or external URL
  uploaded_by varchar(255),
  created_at timestamp default now()
);
create index if not exists idx_evidence_org_task on evidence_items (organization_id, task_id);

-- Attestation campaigns and assignments
create table if not exists attestation_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name varchar(255) not null,
  description text,
  due_date timestamp,
  status varchar(20) not null default 'open', -- open|closed
  created_by varchar(255),
  created_at timestamp default now()
);
create index if not exists idx_attest_campaigns_org on attestation_campaigns (organization_id, status);

create table if not exists attestation_assignments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references attestation_campaigns(id) on delete cascade,
  user_id varchar(255) not null,
  status varchar(20) not null default 'pending', -- pending|attested|declined
  note text,
  attested_at timestamp,
  created_at timestamp default now()
);
create index if not exists idx_attest_assign_campaign on attestation_assignments (campaign_id, status);

-- RLS policies
alter table workflow_tasks enable row level security;
drop policy if exists org_select_tasks on workflow_tasks;
drop policy if exists org_mod_tasks on workflow_tasks;
create policy org_select_tasks on workflow_tasks for select using (app.allow_org(organization_id));
create policy org_mod_tasks on workflow_tasks for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table evidence_items enable row level security;
drop policy if exists org_select_evidence on evidence_items;
drop policy if exists org_mod_evidence on evidence_items;
create policy org_select_evidence on evidence_items for select using (app.allow_org(organization_id));
create policy org_mod_evidence on evidence_items for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table attestation_campaigns enable row level security;
drop policy if exists org_select_attest_campaigns on attestation_campaigns;
drop policy if exists org_mod_attest_campaigns on attestation_campaigns;
create policy org_select_attest_campaigns on attestation_campaigns for select using (app.allow_org(organization_id));
create policy org_mod_attest_campaigns on attestation_campaigns for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

commit;


