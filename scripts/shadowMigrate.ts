#!/usr/bin/env tsx
import pg from 'pg';
const { Client } = pg as any;
import fs from 'fs';
import path from 'path';

async function main() {
  const srcUrl = process.env.DATABASE_URL;
  const shadowUrl = process.env.SHADOW_DATABASE_URL;
  if (!srcUrl || !shadowUrl) throw new Error('DATABASE_URL and SHADOW_DATABASE_URL required');

  const client = new Client({ connectionString: shadowUrl });
  await client.connect();
  try {
    const migrationsDir = path.resolve(process.cwd(), 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf-8');
      await client.query(sql);
    }
    console.log('Shadow migrations applied successfully');
    process.exit(0);
  } catch (e: any) {
    console.error('Shadow migration failed:', e?.message || e);
    process.exit(1);
  } finally { await client.end(); }
}

main();


