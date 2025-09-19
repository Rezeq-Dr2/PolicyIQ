-- RLS guardrails with feature-flagged enforcement
-- Safe by default: enforcement disabled unless app.enforce_rls = 'true'

-- Create app schema for GUC helpers
create schema if not exists app;

-- Helper to read current org from GUC
create or replace function app.current_org()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.organization_id', true), '')::uuid;
$$;

-- Helper to read enforce flag
create or replace function app.enforce_rls()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('app.enforce_rls', true), '')::boolean, false);
$$;

-- Convenience predicate
create or replace function app.allow_org(org_id uuid)
returns boolean
language sql
stable
as $$
  select (not app.enforce_rls()) or (org_id is not null and org_id = app.current_org());
$$;

-- Enable RLS and policies on org-scoped tables

alter table policy_documents enable row level security;
drop policy if exists org_select_policy_documents on policy_documents;
drop policy if exists org_mod_policy_documents on policy_documents;
create policy org_select_policy_documents on policy_documents for select using (app.allow_org(organization_id));
create policy org_mod_policy_documents on policy_documents for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table compliance_reports enable row level security;
drop policy if exists org_select_compliance_reports on compliance_reports;
drop policy if exists org_mod_compliance_reports on compliance_reports;
create policy org_select_compliance_reports on compliance_reports for select using (app.allow_org(organization_id));
create policy org_mod_compliance_reports on compliance_reports for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table policy_document_versions enable row level security;
drop policy if exists org_select_policy_document_versions on policy_document_versions;
drop policy if exists org_mod_policy_document_versions on policy_document_versions;
create policy org_select_policy_document_versions on policy_document_versions for select using (app.allow_org(organization_id));
create policy org_mod_policy_document_versions on policy_document_versions for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table compliance_trends enable row level security;
drop policy if exists org_select_compliance_trends on compliance_trends;
drop policy if exists org_mod_compliance_trends on compliance_trends;
create policy org_select_compliance_trends on compliance_trends for select using (app.allow_org(organization_id));
create policy org_mod_compliance_trends on compliance_trends for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table compliance_improvements enable row level security;
drop policy if exists org_select_compliance_improvements on compliance_improvements;
drop policy if exists org_mod_compliance_improvements on compliance_improvements;
create policy org_select_compliance_improvements on compliance_improvements for select using (app.allow_org(organization_id));
create policy org_mod_compliance_improvements on compliance_improvements for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table compliance_calendar_events enable row level security;
drop policy if exists org_select_calendar on compliance_calendar_events;
drop policy if exists org_mod_calendar on compliance_calendar_events;
create policy org_select_calendar on compliance_calendar_events for select using (app.allow_org(organization_id));
create policy org_mod_calendar on compliance_calendar_events for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table predictive_risk_models enable row level security;
drop policy if exists org_select_prm on predictive_risk_models;
drop policy if exists org_mod_prm on predictive_risk_models;
create policy org_select_prm on predictive_risk_models for select using (app.allow_org(organization_id));
create policy org_mod_prm on predictive_risk_models for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table analytics_metrics enable row level security;
drop policy if exists org_select_metrics on analytics_metrics;
drop policy if exists org_mod_metrics on analytics_metrics;
create policy org_select_metrics on analytics_metrics for select using (app.allow_org(organization_id));
create policy org_mod_metrics on analytics_metrics for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table executive_reports enable row level security;
drop policy if exists org_select_exec on executive_reports;
drop policy if exists org_mod_exec on executive_reports;
create policy org_select_exec on executive_reports for select using (app.allow_org(organization_id));
create policy org_mod_exec on executive_reports for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table kpi_dashboards enable row level security;
drop policy if exists org_select_kpi on kpi_dashboards;
drop policy if exists org_mod_kpi on kpi_dashboards;
create policy org_select_kpi on kpi_dashboards for select using (app.allow_org(organization_id));
create policy org_mod_kpi on kpi_dashboards for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table report_schedules enable row level security;
drop policy if exists org_select_schedules on report_schedules;
drop policy if exists org_mod_schedules on report_schedules;
create policy org_select_schedules on report_schedules for select using (app.allow_org(organization_id));
create policy org_mod_schedules on report_schedules for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table bi_exports enable row level security;
drop policy if exists org_select_bi on bi_exports;
drop policy if exists org_mod_bi on bi_exports;
create policy org_select_bi on bi_exports for select using (app.allow_org(organization_id));
create policy org_mod_bi on bi_exports for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table regulatory_notifications enable row level security;
drop policy if exists org_select_notif on regulatory_notifications;
drop policy if exists org_mod_notif on regulatory_notifications;
create policy org_select_notif on regulatory_notifications for select using (app.allow_org(organization_id));
create policy org_mod_notif on regulatory_notifications for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table update_impact_assessments enable row level security;
drop policy if exists org_select_uia on update_impact_assessments;
drop policy if exists org_mod_uia on update_impact_assessments;
create policy org_select_uia on update_impact_assessments for select using (app.allow_org(organization_id));
create policy org_mod_uia on update_impact_assessments for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

-- Tables without org_id but org-linked via FK: analysis_results
alter table analysis_results enable row level security;
drop policy if exists org_select_ar on analysis_results;
drop policy if exists org_mod_ar on analysis_results;
create policy org_select_ar on analysis_results for select using (
  not app.enforce_rls() or exists (
    select 1 from compliance_reports r where r.id = analysis_results.report_id and app.allow_org(r.organization_id)
  )
);
create policy org_mod_ar on analysis_results for all using (
  not app.enforce_rls() or exists (
    select 1 from compliance_reports r where r.id = analysis_results.report_id and app.allow_org(r.organization_id)
  )
) with check (
  not app.enforce_rls() or exists (
    select 1 from compliance_reports r where r.id = analysis_results.report_id and app.allow_org(r.organization_id)
  )
);

-- Optional helpful indexes
create index if not exists idx_policy_documents_org on policy_documents (organization_id);
create index if not exists idx_compliance_reports_org on compliance_reports (organization_id, created_at);
create index if not exists idx_compliance_trends_org on compliance_trends (organization_id, measurement_date);
create index if not exists idx_calendar_org_date on compliance_calendar_events (organization_id, date);
create index if not exists idx_metrics_org_type on analytics_metrics (organization_id, metric_type);
create index if not exists idx_exec_reports_org on executive_reports (organization_id, created_at);
create index if not exists idx_notif_org on regulatory_notifications (organization_id, created_at);
create index if not exists idx_uia_org on update_impact_assessments (organization_id, created_at);

-- Set default to not enforce to avoid breaking dev/tests. Enable in prod via:
--   ALTER DATABASE "yourdb" SET app.enforce_rls = 'true';
-- And set per-request org via: SET app.organization_id = '<org-uuid>';

