alter table processing_metrics add column if not exists organization_id uuid;
create index if not exists idx_processing_metrics_org_created on processing_metrics (organization_id, created_at);

