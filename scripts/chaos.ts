#!/usr/bin/env tsx
import { analysisQueue } from '../server/services/queue';
import { redis } from '../server/services/queue';
import { db } from '../server/db';

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const durationSec = parseInt(process.env.CHAOS_DURATION_SEC || '60', 10);
  const end = Date.now() + durationSec * 1000;
  let events = 0;
  while (Date.now() < end) {
    try {
      // Randomly enqueue and pause/resume
      const r = Math.random();
      if (r < 0.33) await analysisQueue.pause();
      else if (r < 0.66) await analysisQueue.resume();
      else await redis.ping();
      // Quick DB check
      try { await db.execute({} as any); } catch {}
      events++;
    } catch {}
    await sleep(250);
  }
  console.log(`Chaos completed. events=${events}`);
}

main().catch((e) => { console.error('Chaos failed', e); process.exit(1); });


