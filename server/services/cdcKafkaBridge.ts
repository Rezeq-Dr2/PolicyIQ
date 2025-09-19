import { Kafka } from 'kafkajs';
import { db } from '../db';
import { sql } from 'drizzle-orm';

export class CdcKafkaBridge {
  private kafka: Kafka | null = null;

  async init() {
    const brokers = process.env.KAFKA_BROKERS;
    if (!brokers) return;
    this.kafka = new Kafka({ clientId: 'policyiq-cdc', brokers: brokers.split(',') });
  }

  async publishPending(limit: number = 100): Promise<number> {
    if (!this.kafka) return 0;
    const producer = this.kafka.producer();
    await producer.connect();
    try {
      const res: any = await db.execute(sql`
        select id, organization_id, topic, payload from outbox_events
        where status = 'pending'
        order by created_at asc
        limit ${limit}
      ` as any);
      const rows: any[] = res?.rows ?? [];
      if (!rows.length) return 0;
      for (const r of rows) {
        const t = `tenant.${r.organization_id || 'na'}.${r.topic}`.replace(/[^a-zA-Z0-9._-]/g, '.');
        await producer.send({ topic: t, messages: [{ key: String(r.organization_id || ''), value: JSON.stringify(r) }] });
        await db.execute(sql`update outbox_events set status='dispatched', dispatched_at=now() where id=${r.id}::uuid` as any);
      }
      return rows.length;
    } finally {
      await producer.disconnect();
    }
  }
}

export const cdcKafkaBridge = new CdcKafkaBridge();
