-- Knowledge Graph + Rules Engine schema

begin;

-- Graph nodes for regulations and clauses
create table if not exists regulation_graph_nodes (
  id uuid primary key default gen_random_uuid(),
  regulation_id uuid references regulations(id) on delete cascade,
  node_type varchar(30) not null, -- 'regulation'|'section'|'clause'|'guidance'
  label text not null,
  ref varchar(200), -- e.g., "Art. 5(1)(a)"
  created_at timestamp default now()
);

create table if not exists regulation_graph_edges (
  id uuid primary key default gen_random_uuid(),
  from_node_id uuid not null references regulation_graph_nodes(id) on delete cascade,
  to_node_id uuid not null references regulation_graph_nodes(id) on delete cascade,
  relation varchar(40) not null, -- 'contains'|'references'|'requires'|'amends'
  created_at timestamp default now()
);
create index if not exists idx_graph_edges_from_to on regulation_graph_edges (from_node_id, to_node_id);

-- Mappings from customer policy documents to graph nodes
create table if not exists policy_node_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  policy_document_id uuid not null references policy_documents(id) on delete cascade,
  node_id uuid not null references regulation_graph_nodes(id) on delete cascade,
  confidence real default 0,
  created_at timestamp default now()
);
create index if not exists idx_policy_node_map_org_policy on policy_node_mappings (organization_id, policy_document_id);

-- Rules catalog (declarative JSON expressions)
create table if not exists compliance_rules (
  id uuid primary key default gen_random_uuid(),
  regulation_id uuid references regulations(id) on delete cascade,
  name varchar(255) not null,
  description text,
  severity varchar(20) not null default 'medium', -- low|medium|high|critical
  expression jsonb not null, -- DSL: { all: [ { keyword: "record of processing" }, { nodeRef: "Art.30" } ] }
  is_active boolean default true,
  created_at timestamp default now()
);
create index if not exists idx_rules_regulation_active on compliance_rules (regulation_id) where is_active;

-- Rule evaluations per report (org-scoped via report)
create table if not exists rule_evaluations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references compliance_reports(id) on delete cascade,
  rule_id uuid not null references compliance_rules(id) on delete cascade,
  passed boolean not null,
  details jsonb,
  created_at timestamp default now()
);
create index if not exists idx_rule_eval_report on rule_evaluations (report_id);

-- RLS for policy_node_mappings (org scoped)
alter table policy_node_mappings enable row level security;
drop policy if exists org_select_policymap on policy_node_mappings;
drop policy if exists org_mod_policymap on policy_node_mappings;
create policy org_select_policymap on policy_node_mappings for select using (app.allow_org(organization_id));
create policy org_mod_policymap on policy_node_mappings for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

-- RLS-like for rule_evaluations via parent report's org
alter table rule_evaluations enable row level security;
drop policy if exists org_select_rule_eval on rule_evaluations;
drop policy if exists org_mod_rule_eval on rule_evaluations;
create policy org_select_rule_eval on rule_evaluations for select using (
  not app.enforce_rls() or exists (
    select 1 from compliance_reports r where r.id = rule_evaluations.report_id and app.allow_org(r.organization_id)
  )
);
create policy org_mod_rule_eval on rule_evaluations for all using (
  not app.enforce_rls() or exists (
    select 1 from compliance_reports r where r.id = rule_evaluations.report_id and app.allow_org(r.organization_id)
  )
) with check (
  not app.enforce_rls() or exists (
    select 1 from compliance_reports r where r.id = rule_evaluations.report_id and app.allow_org(r.organization_id)
  )
);

commit;


