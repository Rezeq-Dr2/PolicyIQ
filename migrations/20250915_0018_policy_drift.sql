create table if not exists policy_drift (
  id uuid primary key default gen_random_uuid(),
  policy_document_id uuid not null,
  baseline_template_id uuid,
  drift_score numeric not null,
  computed_at timestamptz not null default now()
);

create index if not exists idx_policy_drift_doc on policy_drift (policy_document_id, computed_at desc);


