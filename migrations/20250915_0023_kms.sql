-- Per-tenant key store and encrypted config columns
create table if not exists org_keys (
  organization_id uuid primary key,
  key_bytes bytea not null,
  created_at timestamptz not null default now()
);

alter table data_sources add column if not exists config_enc bytea;
alter table collectors add column if not exists config_enc bytea;


