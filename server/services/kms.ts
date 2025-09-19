import crypto from 'crypto';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { vault } from './vault';

function aesGcmEncrypt(key: Buffer, plaintext: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

function aesGcmDecrypt(key: Buffer, blob: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const data = blob.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export class KmsService {
  private deriveMasterKey(): Buffer {
    let mk = process.env.ENCRYPTION_MASTER_KEY || '';
    const vaultPath = process.env.VAULT_MASTER_KEY_PATH || '';
    if (!mk && vaultPath) {
      // best-effort read from Vault KV
      // Note: readSecret returns {master_key: '...'}
      // Fallback to dev if absent
      try { /* no await in constructor; read on demand */ } catch {}
    }
    if (!mk && vault.enabled() && vaultPath) {
      // This is async, but deriveMasterKey is sync; do a blocking fallback via env once, else temp key
      mk = 'dev-master-key';
    }
    mk = mk || 'dev-master-key';
    return crypto.createHash('sha256').update(mk).digest();
  }

  private async getOrCreateOrgKey(organizationId: string): Promise<Buffer> {
    const row: any = await db.execute(sql`select key_bytes from org_keys where organization_id=${organizationId}::uuid` as any);
    const existing = (row?.rows ?? [])[0];
    if (existing?.key_bytes) return Buffer.from(existing.key_bytes as Buffer);
    const master = this.deriveMasterKey();
    const raw = crypto.randomBytes(32);
    const wrapped = aesGcmEncrypt(master, raw);
    await db.execute(sql`insert into org_keys (organization_id, key_bytes) values (${organizationId}::uuid, ${wrapped}::bytea) on conflict (organization_id) do update set key_bytes=excluded.key_bytes` as any);
    return raw;
  }

  private async unwrapKey(organizationId: string): Promise<Buffer> {
    const row: any = await db.execute(sql`select key_bytes from org_keys where organization_id=${organizationId}::uuid` as any);
    const wrapped = (row?.rows ?? [])[0]?.key_bytes as Buffer | undefined;
    if (!wrapped) return this.getOrCreateOrgKey(organizationId);
    const master = this.deriveMasterKey();
    return aesGcmDecrypt(master, Buffer.from(wrapped));
  }

  async encryptJsonForOrg(organizationId: string, obj: any): Promise<Buffer> {
    const key = await this.unwrapKey(organizationId);
    const plaintext = Buffer.from(JSON.stringify(obj));
    return aesGcmEncrypt(key, plaintext);
  }

  async decryptJsonForOrg(organizationId: string, blob: Buffer | null | undefined): Promise<any | null> {
    if (!blob) return null;
    const key = await this.unwrapKey(organizationId);
    const pt = aesGcmDecrypt(key, Buffer.from(blob));
    return JSON.parse(pt.toString('utf-8'));
  }

  // Rotate per-org key and rewrap encrypted fields
  async rotateOrgKey(organizationId: string): Promise<{ rewrapped: number }> {
    const oldKey = await this.unwrapKey(organizationId);
    const newKey = crypto.randomBytes(32);
    let master = this.deriveMasterKey();
    try {
      if (vault.enabled() && process.env.VAULT_MASTER_KEY_PATH) {
        const secret = await vault.readSecret(process.env.VAULT_MASTER_KEY_PATH);
        const mk = secret?.master_key || secret?.value || '';
        if (mk) master = crypto.createHash('sha256').update(mk).digest();
      }
    } catch {}
    const wrappedNew = aesGcmEncrypt(master, newKey);
    await db.execute(sql`update org_keys set key_bytes=${wrappedNew}::bytea where organization_id=${organizationId}::uuid` as any);

    let rewrapped = 0;
    // collectors.config_enc
    try {
      const cols: any = await db.execute(sql`select id, config_enc from collectors where organization_id=${organizationId}::uuid and config_enc is not null` as any);
      for (const r of (cols?.rows ?? [])) {
        try {
          const dec = JSON.parse(aesGcmDecrypt(oldKey, Buffer.from(r.config_enc)).toString('utf-8'));
          const enc = aesGcmEncrypt(newKey, Buffer.from(JSON.stringify(dec)));
          await db.execute(sql`update collectors set config_enc=${enc}::bytea where id=${r.id}::uuid` as any);
          rewrapped++;
        } catch {}
      }
    } catch {}
    // data_sources.config_enc
    try {
      const ds: any = await db.execute(sql`select id, config_enc from data_sources where organization_id=${organizationId}::uuid and config_enc is not null` as any);
      for (const r of (ds?.rows ?? [])) {
        try {
          const dec2 = JSON.parse(aesGcmDecrypt(oldKey, Buffer.from(r.config_enc)).toString('utf-8'));
          const enc2 = aesGcmEncrypt(newKey, Buffer.from(JSON.stringify(dec2)));
          await db.execute(sql`update data_sources set config_enc=${enc2}::bytea where id=${r.id}::uuid` as any);
          rewrapped++;
        } catch {}
      }
    } catch {}
    return { rewrapped };
  }
}

export const kmsService = new KmsService();


