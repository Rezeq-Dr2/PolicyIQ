#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');
const UNSAFE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bdrop\s+table\b/i, reason: 'Dropping tables is unsafe in online migrations' },
  { re: /\bdrop\s+column\b/i, reason: 'Dropping columns is unsafe in online migrations' },
  { re: /\balter\s+type\b/i, reason: 'Altering enum/types is unsafe; use create new type + cast' },
  { re: /\brename\s+column\b/i, reason: 'Renaming columns breaks running code; use add+backfill+switch' },
  { re: /\bset\s+not\s+null\b/i, reason: 'Setting NOT NULL without backfill can fail; ensure backfill+default' },
];

function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('No migrations directory found. Skipping guard.');
    process.exit(0);
  }
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
  let violations = 0;
  for (const f of files) {
    const p = path.join(MIGRATIONS_DIR, f);
    const sql = fs.readFileSync(p, 'utf-8');
    for (const pat of UNSAFE_PATTERNS) {
      if (pat.re.test(sql)) {
        console.error(`Unsafe migration pattern in ${f}: ${pat.reason}`);
        violations++;
      }
    }
  }
  if (violations > 0) {
    console.error(`Migration guard failed with ${violations} violation(s).`);
    process.exit(1);
  }
  console.log('Migration guard passed.');
}

main();
