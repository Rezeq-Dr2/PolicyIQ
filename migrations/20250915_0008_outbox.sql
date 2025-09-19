-- Outbox pattern infrastructure (do not apply until all enhancements complete)
create extension if not exists pgcrypto;

create table if not exists outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  topic text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz
);

create index if not exists idx_outbox_org_status_created on outbox_events (organization_id, status, created_at);

-- RLS aligning with app.allow_org guard
alter table outbox_events enable row level security;
drop policy if exists outbox_events_rls on outbox_events;
create policy outbox_events_rls on outbox_events using (
  app.allow_org(organization_id)
) with check (
  app.allow_org(organization_id)
);


