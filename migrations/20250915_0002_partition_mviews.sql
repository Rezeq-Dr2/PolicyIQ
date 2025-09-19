-- Partition compliance_trends by month and add materialized views with scheduled refresh support

begin;

-- Create partitioned replacement for compliance_trends
create table if not exists compliance_trends_new (like compliance_trends including all) partition by range (measurement_date);

-- Default partition to catch historical/edge data
create table if not exists compliance_trends_p_default partition of compliance_trends_new default;

-- Create rolling monthly partitions for current and previous 11 months
do $$
declare
  i int;
  start_month date;
  part_name text;
begin
  for i in 0..11 loop
    start_month := date_trunc('month', now())::date - (i || ' months')::interval;
    part_name := format('compliance_trends_p_%s', to_char(start_month, 'YYYY_MM'));
    execute format(
      'create table if not exists %I partition of compliance_trends_new for values from (%L) to (%L);',
      part_name,
      start_month,
      (start_month + interval '1 month')::date
    );
    execute format('create index if not exists %I_org_date on %I (organization_id, measurement_date);', part_name || '_org_date', part_name);
  end loop;
end $$;

-- Migrate data
insert into compliance_trends_new select * from compliance_trends;

-- Swap tables
alter table compliance_trends rename to compliance_trends_old;
alter table compliance_trends_new rename to compliance_trends;

-- Recreate RLS on the new table (policies are not copied)
alter table compliance_trends enable row level security;
drop policy if exists org_select_compliance_trends on compliance_trends;
drop policy if exists org_mod_compliance_trends on compliance_trends;
create policy org_select_compliance_trends on compliance_trends for select using (app.allow_org(organization_id));
create policy org_mod_compliance_trends on compliance_trends for all using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

-- Helpful index on the parent (covers partition pruning)
create index if not exists idx_compliance_trends_org on compliance_trends (organization_id, measurement_date);

-- Drop old table
drop table if exists compliance_trends_old cascade;

-- Materialized views for analytics

-- Org/Reg trend summary over last 90 days
create materialized view if not exists mv_trend_org_reg_90d as
select
  ct.organization_id,
  ct.regulation_id,
  count(*) as points,
  avg(ct.overall_score) as avg_score,
  min(ct.overall_score) as min_score,
  max(ct.overall_score) as max_score,
  first_value(ct.overall_score) over (partition by ct.organization_id, ct.regulation_id order by ct.measurement_date desc) as latest_score,
  max(ct.measurement_date) as latest_date,
  -- slope per day using linear regression on epoch days
  regr_slope(ct.overall_score, extract(epoch from ct.measurement_date) / 86400.0) as slope_per_day
from compliance_trends ct
where ct.measurement_date >= now() - interval '90 days'
group by ct.organization_id, ct.regulation_id;

create unique index if not exists ux_mv_trend_org_reg_90d on mv_trend_org_reg_90d (organization_id, regulation_id);

-- Org risk summary from compliance_reports over last 30 days
create materialized view if not exists mv_org_risk_summary_30d as
with recent as (
  select organization_id, risk_level
  from compliance_reports
  where created_at >= now() - interval '30 days'
)
select
  organization_id,
  sum((risk_level = 'High')::int) as high_count,
  sum((risk_level = 'Medium')::int) as medium_count,
  sum((risk_level = 'Low')::int) as low_count,
  count(*) as total_reports
from recent
group by organization_id;

create unique index if not exists ux_mv_org_risk_summary_30d on mv_org_risk_summary_30d (organization_id);

commit;


