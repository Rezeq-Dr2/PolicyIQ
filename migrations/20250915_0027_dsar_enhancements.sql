alter table dsar_requests add column if not exists verification_status text not null default 'pending';
alter table dsar_requests add column if not exists verification_token text;
alter table dsar_requests add column if not exists verification_expires_at timestamptz;
alter table dsar_requests add column if not exists due_at timestamptz;

create table if not exists dsar_exports (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  file_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_dsar_exports_req on dsar_exports (request_id, created_at desc);

create table if not exists dsar_sla_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  kind text not null,
  details jsonb,
  created_at timestamptz not null default now()
);


