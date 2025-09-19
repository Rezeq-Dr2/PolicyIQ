-- Cost governance: budgets, caps, windows, token accounting

begin;

create table if not exists org_cost_policies (
  organization_id uuid primary key references organizations(id) on delete cascade,
  daily_token_cap bigint not null default 500000,
  monthly_token_cap bigint not null default 10000000,
  hard_fail boolean not null default true,
  updated_at timestamp default now()
);

create table if not exists org_usage_counters (
  organization_id uuid primary key references organizations(id) on delete cascade,
  window_start timestamp not null default date_trunc('day', now()),
  daily_tokens_used bigint not null default 0,
  month_start date not null default date_trunc('month', now())::date,
  monthly_tokens_used bigint not null default 0,
  updated_at timestamp default now()
);

create table if not exists token_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  service varchar(100) not null, -- 'openai', 'embedding', 'reranker'
  tokens bigint not null,
  cost_cents integer,
  metadata jsonb,
  created_at timestamp default now()
);

create index if not exists idx_token_usage_org_created on token_usage_events (organization_id, created_at);

commit;


