import { db } from '../db';
import { sql } from 'drizzle-orm';

function mapToScimUser(row: any) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: row.id,
    userName: row.email || row.id,
    name: { givenName: row.given_name || '', familyName: row.family_name || '' },
    active: row.active !== false,
    emails: row.email ? [{ value: row.email, primary: true }] : [],
    meta: { resourceType: 'User' },
  };
}

export class ScimService {
  async listUsers(params: { startIndex?: number; count?: number; filter?: string }): Promise<any> {
    const startIndex = Math.max(1, params.startIndex || 1);
    const count = Math.min(100, Math.max(1, params.count || 50));
    const rows: any = await db.execute(sql`select id, email, given_name, family_name, active from users order by created_at desc limit ${count} offset ${startIndex - 1}` as any);
    const Resources = (rows?.rows ?? []).map(mapToScimUser);
    return { totalResults: Resources.length, startIndex, itemsPerPage: Resources.length, Resources, schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"] };
  }

  async getUser(id: string): Promise<any | null> {
    const rows: any = await db.execute(sql`select id, email, given_name, family_name, active from users where id=${id}` as any);
    const r = (rows?.rows ?? [])[0];
    return r ? mapToScimUser(r) : null;
  }

  async createUser(body: any): Promise<any> {
    const email = body?.userName || body?.emails?.[0]?.value || '';
    const given = body?.name?.givenName || '';
    const family = body?.name?.familyName || '';
    const active = body?.active !== false;
    const res: any = await db.execute(sql`insert into users (email, given_name, family_name, active) values (${email}, ${given}, ${family}, ${active}) returning id, email, given_name, family_name, active` as any);
    return mapToScimUser((res?.rows ?? [])[0]);
  }

  async replaceUser(id: string, body: any): Promise<any> {
    const email = body?.userName || body?.emails?.[0]?.value || null;
    const given = body?.name?.givenName || null;
    const family = body?.name?.familyName || null;
    const active = body?.active;
    const res: any = await db.execute(sql`
      update users set
        email = coalesce(${email}, email),
        given_name = coalesce(${given}, given_name),
        family_name = coalesce(${family}, family_name),
        active = coalesce(${active}, active),
        updated_at = now()
      where id=${id} returning id, email, given_name, family_name, active
    ` as any);
    const r = (res?.rows ?? [])[0];
    return mapToScimUser(r);
  }

  async deleteUser(id: string): Promise<void> {
    await db.execute(sql`update users set active=false, updated_at=now() where id=${id}` as any);
  }
}

export const scimService = new ScimService();


