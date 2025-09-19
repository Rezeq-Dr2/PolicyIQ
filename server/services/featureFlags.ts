import { redis } from './queue';

function envFlagName(name: string): string {
  return `FLAG_${name.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
}

export class FeatureFlags {
  async isEnabled(name: string, organizationId?: string): Promise<boolean> {
    const orgKey = organizationId ? `flag:${name}:org:${organizationId}` : '';
    try {
      if (orgKey) {
        const v = await redis.get(orgKey);
        if (v === '1') return true;
        if (v === '0') return false;
      }
      const g = await redis.get(`flag:${name}:global`);
      if (g === '1') return true;
      if (g === '0') return false;
    } catch {}
    const env = process.env[envFlagName(name)];
    if (env === '1' || env === 'true') return true;
    if (env === '0' || env === 'false') return false;
    return false;
  }

  async setFlag(name: string, value: boolean, organizationId?: string): Promise<void> {
    const key = organizationId ? `flag:${name}:org:${organizationId}` : `flag:${name}:global`;
    await redis.set(key, value ? '1' : '0');
  }
}

export const featureFlags = new FeatureFlags();

// Back-compat helper
export const isEnabled = (flag: string, orgId?: string) => featureFlags.isEnabled(flag, orgId);
