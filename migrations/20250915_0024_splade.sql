-- Sparse retrieval (SPLADE-like) support: per-clause term weights
create table if not exists regulation_clause_terms (
  id uuid primary key default gen_random_uuid(),
  regulation_clause_id uuid not null references regulation_clauses(id) on delete cascade,
  term text not null,
  weight real not null,
  created_at timestamptz not null default now(),
  unique (regulation_clause_id, term)
);

create index if not exists idx_rct_term on regulation_clause_terms (term);
create index if not exists idx_rct_clause on regulation_clause_terms (regulation_clause_id);


