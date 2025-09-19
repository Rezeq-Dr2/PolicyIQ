#!/usr/bin/env tsx
import pg from 'pg';
const { Client } = pg as any;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('select 1');
    await client.query('select count(*) from dpia_records');
    await client.query('select count(*) from consent_purposes');
    await client.query('select count(*) from incidents');
    await client.query('select count(*) from hs_risk_assessments');
    await client.query('select count(*) from data_assets');
    console.log('Smoke DB OK');
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('Smoke DB failed:', e?.message || e); process.exit(1); });


