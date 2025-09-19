#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Client } = pg as any;

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch {}
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply') || args.includes('-a');
  const root = process.cwd();
  const migrationsDir = path.join(root, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.error('No migrations/ directory found');
    process.exit(1);
  }

  const ordered = [
    '20250915_0001_rls_guardrails.sql',
    '20250915_0002_partition_mviews.sql',
    '20250915_0003_pgvector.sql',
    '20250915_0004_ai_quality.sql',
    '20250915_0005_cost_governance.sql',
    '20250915_0006_governance.sql',
    '20250915_0007_kg_rules.sql',
    '20250915_0008_outbox.sql',
    '20250915_0009_big_bets.sql',
    '20250915_0010_pgvector_hnsw.sql',
  ].map(f => path.join(migrationsDir, f)).filter(p => fs.existsSync(p));

  const env = { ...parseEnvFile(path.join(root, '.env')), ...process.env } as Record<string, string>;
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is not set. Set it in environment or .env');
    process.exit(2);
  }

  console.log(`[MIGRATIONS] ${apply ? 'Applying' : 'Dry-run'} ${ordered.length} files`);

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    // connection check
    await client.query('select 1');
    if (!apply) {
      for (const file of ordered) {
        console.log(`- would apply: ${path.basename(file)} (${fs.statSync(file).size} bytes)`);
      }
      console.log('Dry-run complete. Re-run with --apply to execute.');
      return;
    }

    for (const file of ordered) {
      const sql = fs.readFileSync(file, 'utf-8');
      console.log(`[APPLY] ${path.basename(file)}`);
      await client.query(sql);
    }
    console.log('All migrations applied successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration apply failed:', err?.message || err);
  process.exit(1);
});


