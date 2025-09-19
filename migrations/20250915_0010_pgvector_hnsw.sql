-- Enable HNSW index for pgvector when available (skip errors gracefully)
DO $$
BEGIN
  BEGIN
    EXECUTE 'create index if not exists idx_rce_embedding_hnsw on regulation_clause_embeddings using hnsw (embedding vector_cosine_ops)';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'HNSW not available: %', SQLERRM;
  END;
END $$;
