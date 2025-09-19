import pg from 'pg';
import { Kafka } from 'kafkajs';

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

export async function startLogicalCdc(): Promise<void> {
  const connStr = process.env.PG_REPLICATION_CONNSTR;
  const brokers = process.env.KAFKA_BROKERS;
  if (!connStr || !brokers) {
    return;
  }

  const slotName = process.env.PG_REPL_SLOT || 'policyiq_slot';
  const targetTables = process.env.PG_CDC_TABLES || '';
  const kafka = new Kafka({ clientId: 'policyiq-cdc', brokers: brokers.split(',') });
  const producer = kafka.producer();
  await producer.connect();

  const client = new pg.Client({ connectionString: connStr });
  await client.connect();

  // Ensure slot exists (wal2json plugin required)
  try {
    const exists = await client.query("select 1 from pg_replication_slots where slot_name = $1", [slotName]);
    if (exists.rowCount === 0) {
      await client.query("select * from pg_create_logical_replication_slot($1, 'wal2json')", [slotName]);
      console.log(`[CDC] Created logical replication slot ${slotName}`);
    }
  } catch (e) {
    console.error('[CDC] Failed to ensure replication slot (is wal2json installed?):', (e as any)?.message || e);
    await client.end();
    await producer.disconnect();
    return;
  }

  console.log('[CDC] Logical decoding loop started');
  (async () => {
    for (;;) {
      try {
        // Fetch changes using wal2json (polling). This consumes from the slot and advances confirmed_flush_lsn
        // You can scope tables using add-tables option if desired
        const opts: string[] = ["'format-version','2'"];
        if (targetTables) {
          opts.push(`'add-tables','${targetTables.replace(/'/g, "''")}'`);
        }
        const q = `select data from pg_logical_slot_get_changes($1, NULL, NULL, ${opts.join(',')})`;
        const res = await client.query(q, [slotName]);
        const rows = res.rows as Array<{ data: string }>;
        if (rows.length === 0) {
          await sleep(1000);
          continue;
        }
        for (const r of rows) {
          try {
            const payload = JSON.parse(r.data);
            // wal2json v2 wraps as { change: [ { kind, schema, table, columnnames, columnvalues, ... }, ... ] }
            const changes = Array.isArray(payload.change) ? payload.change : [];
            for (const c of changes) {
              const schema = c.schema || 'public';
              const table = c.table || 'unknown';
              const topic = `cdc.${schema}.${table}`;
              await producer.send({ topic, messages: [{ value: JSON.stringify(c) }] });
            }
          } catch (e) {
            // if parsing fails, emit raw
            await producer.send({ topic: 'cdc.raw', messages: [{ value: r.data }] });
          }
        }
      } catch (e) {
        console.error('[CDC] Error while streaming changes:', (e as any)?.message || e);
        await sleep(2000);
      }
    }
  })().catch(() => {});
}


