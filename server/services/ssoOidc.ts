import crypto from 'crypto';
import { storage } from '../storage';
import { redis } from './queue';

function base64url(input: Buffer | string): string {
  const b = typeof input === 'string' ? Buffer.from(input) : input;
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export class OidcSsoService {
  get config() {
    const {
      OIDC_AUTH_URL,
      OIDC_TOKEN_URL,
      OIDC_JWKS_URL,
      OIDC_CLIENT_ID,
      OIDC_CLIENT_SECRET,
      OIDC_REDIRECT_URI,
      OIDC_SCOPE
    } = process.env as Record<string, string | undefined>;
    if (!OIDC_AUTH_URL || !OIDC_TOKEN_URL || !OIDC_JWKS_URL || !OIDC_CLIENT_ID || !OIDC_REDIRECT_URI) {
      throw new Error('OIDC configuration missing');
    }
    return { authUrl: OIDC_AUTH_URL, tokenUrl: OIDC_TOKEN_URL, jwksUrl: OIDC_JWKS_URL, clientId: OIDC_CLIENT_ID, clientSecret: OIDC_CLIENT_SECRET || '', redirectUri: OIDC_REDIRECT_URI, scope: OIDC_SCOPE || 'openid email profile' };
  }

  buildAuthUrl(state: string, nonce: string): string {
    const c = this.config;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      scope: c.scope,
      state,
      nonce
    });
    return `${c.authUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<{ id_token: string; access_token?: string }>
  {
    const c = this.config;
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: c.redirectUri,
      client_id: c.clientId,
    });
    if (c.clientSecret) body.set('client_secret', c.clientSecret);
    const resp = await fetch(c.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status}`);
    const j = await resp.json();
    if (!j.id_token) throw new Error('Missing id_token');
    return j;
  }

  async getJwk(kid: string): Promise<any> {
    const c = this.config;
    const cacheKey = `jwks:${c.jwksUrl}`;
    let jwks: any = null;
    try { const cached = await redis.get(cacheKey); if (cached) jwks = JSON.parse(cached); } catch {}
    if (!jwks) {
      const resp = await fetch(c.jwksUrl);
      if (!resp.ok) throw new Error('Failed to fetch JWKS');
      jwks = await resp.json();
      try { await redis.set(cacheKey, JSON.stringify(jwks), 'EX', 3600); } catch {}
    }
    const key = (jwks?.keys || []).find((k: any) => k.kid === kid);
    if (!key) throw new Error('JWK not found');
    return key;
  }

  async verifyIdToken(idToken: string, expectedNonce?: string): Promise<any> {
    const [h, p, s] = idToken.split('.');
    const header = JSON.parse(Buffer.from(h, 'base64').toString('utf-8'));
    const payload = JSON.parse(Buffer.from(p, 'base64').toString('utf-8'));
    const alg = header.alg;
    if (!alg || !header.kid) throw new Error('Invalid JWT header');
    const jwk = await this.getJwk(header.kid);
    const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' as any });
    const verifier = crypto.createVerify(alg.startsWith('RS') ? 'RSA-SHA256' : 'sha256');
    verifier.update(`${h}.${p}`);
    verifier.end();
    const ok = verifier.verify(keyObject, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
    if (!ok) throw new Error('Invalid id_token signature');
    if (expectedNonce && payload.nonce !== expectedNonce) throw new Error('Nonce mismatch');
    return payload;
  }

  signAppJwt(claims: Record<string, any>, ttlSeconds = 7 * 24 * 3600): string {
    const secret = process.env.APP_JWT_SECRET || 'dev-app-secret';
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = { ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds, iat: Math.floor(Date.now() / 1000) };
    const enc = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const sig = crypto.createHmac('sha256', secret).update(enc).digest();
    return `${enc}.${base64url(sig)}`;
  }
}

export const oidcSsoService = new OidcSsoService();


