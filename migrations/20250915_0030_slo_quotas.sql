create table if not exists slo_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  target_latency_ms integer,
  max_error_rate real,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, name)
);

create table if not exists feature_quotas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  feature text not null,
  window text not null, -- 'daily' | 'hourly'
  limit_count integer not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, feature, window)
);


