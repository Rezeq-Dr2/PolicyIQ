import { db } from '../db';
import { sql } from 'drizzle-orm';
import { redis } from './queue';

export interface OutboxEvent {
  id: string;
  organizationId: string;
  topic: string;
  payload: any;
}

export async function queueOutboxEvent(params: { organizationId: string; topic: string; payload: any }): Promise<void> {
  const { organizationId, topic, payload } = params;
  await db.execute(sql`
    insert into outbox_events (organization_id, topic, payload)
    values (${organizationId}::uuid, ${topic}, ${JSON.stringify(payload)}::jsonb)
  ` as any);
}

export async function dispatchPending(limit: number = 100): Promise<number> {
  const pending: any = await db.execute(sql`
    select id, organization_id, topic, payload from outbox_events
    where status = 'pending'
    order by created_at asc
    limit ${limit}
  ` as any);
  const rows: any[] = pending?.rows ?? [];
  let dispatched = 0;
  for (const row of rows) {
    const event: OutboxEvent = {
      id: row.id,
      organizationId: row.organization_id,
      topic: row.topic,
      payload: row.payload,
    };
    try {
      await redis.publish(`events:${event.topic}`, JSON.stringify(event));
      await redis.publish('events', JSON.stringify(event));
      await db.execute(sql`
        update outbox_events set status = 'dispatched', dispatched_at = now()
        where id = ${event.id}::uuid
      ` as any);
      dispatched++;
    } catch (err) {
      await db.execute(sql`
        update outbox_events set attempts = attempts + 1
        where id = ${event.id}::uuid
      ` as any);
    }
  }
  return dispatched;
}
