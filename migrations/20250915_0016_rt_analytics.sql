-- Real-time analytics materialized views for new modules

-- Consent coverage per org/purpose based on latest subject state
create materialized view if not exists mv_consent_org_purpose as
with latest as (
  select distinct on (organization_id, purpose_id, subject_hash)
    organization_id, purpose_id, subject_hash, granted, timestamp
  from consent_records
  order by organization_id, purpose_id, subject_hash, timestamp desc
)
select organization_id, purpose_id,
  count(*) filter (where granted) as granted_subjects,
  count(*) filter (where not granted) as revoked_subjects,
  count(*) as total_subjects
from latest
group by organization_id, purpose_id;

create unique index if not exists ux_mv_consent_org_purpose on mv_consent_org_purpose (organization_id, purpose_id);

-- Training status per org (assigned/completed)
create materialized view if not exists mv_training_org_status as
select t.organization_id,
  count(a.*) filter (where a.status = 'assigned') as assigned,
  count(a.*) filter (where a.status = 'completed') as completed,
  count(a.*) as total
from trainings t
left join training_assignments a on a.training_id = t.id
group by t.organization_id;

create unique index if not exists ux_mv_training_org_status on mv_training_org_status (organization_id);

-- H&S incident summary per org by status
create materialized view if not exists mv_hs_incidents_org as
select organization_id,
  count(*) filter (where status = 'open') as open_incidents,
  count(*) filter (where status = 'closed') as closed_incidents,
  count(*) as total_incidents
from hs_incidents
group by organization_id;

create unique index if not exists ux_mv_hs_incidents_org on mv_hs_incidents_org (organization_id);


