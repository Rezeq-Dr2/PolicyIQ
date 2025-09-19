-- Incidents and breach notifications with RLS
create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  discovered_at timestamptz not null default now(),
  description text,
  data_subjects_estimate integer,
  regulators jsonb,
  status text not null default 'open',
  severity text,
  cause text,
  created_at timestamptz not null default now()
);

create table if not exists breach_notifications (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  regulator text not null,
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  content text,
  status text not null default 'pending'
);

create index if not exists idx_incidents_org_status on incidents (organization_id, status);
create index if not exists idx_breach_incident on breach_notifications (incident_id);

alter table incidents enable row level security;
drop policy if exists incidents_rls on incidents;
create policy incidents_rls on incidents using (app.allow_org(organization_id)) with check (app.allow_org(organization_id));

alter table breach_notifications enable row level security;
drop policy if exists breach_notifications_rls on breach_notifications;
create policy breach_notifications_rls on breach_notifications using (
  exists (select 1 from incidents i where i.id = breach_notifications.incident_id and app.allow_org(i.organization_id))
) with check (
  exists (select 1 from incidents i where i.id = breach_notifications.incident_id and app.allow_org(i.organization_id))
);


