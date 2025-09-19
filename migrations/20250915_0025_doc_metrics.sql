create table if not exists document_dedup (
  id uuid primary key,
  simhash text not null,
  created_at timestamptz not null default now()
);

create table if not exists document_dupes (
  document_id uuid not null,
  duplicate_of uuid not null,
  distance integer not null,
  created_at timestamptz not null default now(),
  primary key (document_id, duplicate_of)
);

create table if not exists ocr_metrics (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  file_name text,
  used_ocr boolean not null default false,
  simhash text,
  created_at timestamptz not null default now()
);

create table if not exists processing_metrics (
  id uuid primary key default gen_random_uuid(),
  document_id text,
  kind text not null,
  metric numeric not null,
  created_at timestamptz not null default now()
);


