-- AI Quality System: golden dataset, eval runs, and results

begin;

create table if not exists golden_examples (
  id uuid primary key default gen_random_uuid(),
  prompt_type varchar(100) not null,
  input_text text not null,
  regulation_name varchar(255),
  expected jsonb, -- { summary, riskLevel, hasRecommendations, minScore }
  tags text[],
  created_at timestamp default now()
);

create index if not exists idx_golden_prompt_type on golden_examples (prompt_type);

create table if not exists eval_runs (
  id uuid primary key default gen_random_uuid(),
  prompt_type varchar(100) not null,
  prompt_version_id uuid,
  started_at timestamp default now(),
  completed_at timestamp,
  notes text
);

create table if not exists eval_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references eval_runs(id) on delete cascade,
  example_id uuid not null references golden_examples(id) on delete cascade,
  score real not null,
  details jsonb,
  created_at timestamp default now()
);

create index if not exists idx_eval_results_run on eval_results (run_id);

commit;


