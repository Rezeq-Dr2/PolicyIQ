create table if not exists index_baselines (
  name text primary key,
  query text not null,
  plan_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


