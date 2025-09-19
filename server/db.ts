import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Optional read-replica for analytics/BI reads
const READ_DATABASE_URL = process.env.READ_DATABASE_URL || process.env.DATABASE_RO_URL;
export const poolRo = READ_DATABASE_URL
  ? new Pool({ connectionString: READ_DATABASE_URL })
  : pool;
// RLS helpers: expose a per-request way to set organization context
export async function withOrganization<T>(organizationId: string | null, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    if (organizationId) {
      await client.query(`set app.organization_id = $1`, [organizationId]);
    } else {
      await client.query(`reset app.organization_id`);
    }
    return await fn();
  } finally {
    client.release();
  }
}
export const db = drizzle({ client: pool, schema });
export const dbRead = drizzle({ client: poolRo, schema });

// ABAC/RLS helper: set both user and organization for the duration of the callback using a dedicated client
export async function withUserOrganization<T>(
  params: { userId?: string | null; organizationId?: string | null },
  fn: (dbc: ReturnType<typeof drizzle>) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    if (params.organizationId) {
      await client.query(`set app.organization_id = $1`, [params.organizationId]);
    } else {
      await client.query(`reset app.organization_id`);
    }
    if (params.userId) {
      await client.query(`set app.user_id = $1`, [params.userId]);
    } else {
      await client.query(`reset app.user_id`);
    }
    const dbc = drizzle({ client, schema });
    return await fn(dbc);
  } finally {
    client.release();
  }
}