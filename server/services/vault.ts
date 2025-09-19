export class VaultClient {
  baseUrl: string;
  token: string;
  constructor() {
    this.baseUrl = process.env.VAULT_ADDR || '';
    this.token = process.env.VAULT_TOKEN || '';
  }
  enabled(): boolean { return !!(this.baseUrl && this.token); }
  async readSecret(path: string): Promise<any | null> {
    if (!this.enabled()) return null;
    const res = await fetch(`${this.baseUrl}/v1/${path}`, { headers: { 'X-Vault-Token': this.token } });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.data?.data || j?.data || null;
  }
}

export const vault = new VaultClient();


