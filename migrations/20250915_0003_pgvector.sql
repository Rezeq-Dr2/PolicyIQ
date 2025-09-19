-- Enable pgvector and add clause embeddings table

begin;

create extension if not exists vector;

create table if not exists regulation_clause_embeddings (
  clause_id uuid primary key references regulation_clauses(id) on delete cascade,
  regulation_id uuid not null references regulations(id),
  content text not null,
  embedding vector(1536),
  updated_at timestamp default now()
);

create index if not exists idx_rce_regulation on regulation_clause_embeddings (regulation_id);
-- IVFFlat index for approximate nearest neighbor search (requires analyze before use)
do $$ begin
  execute 'create index if not exists idx_rce_embedding on regulation_clause_embeddings using ivfflat (embedding vector_cosine_ops) with (lists=100)';
exception when others then
  -- Some Postgres flavors may not support ivfflat index creation without superuser; fallback without failing migration
  raise notice 'Skipping IVFFlat index creation: %', sqlerrm;
end $$;

commit;


