import type { Request, Response, NextFunction } from 'express';
import { redis } from '../services/queue';

export function rateLimitByOrg(opts: { capacity: number; refillPerSecond: number }) {
  const { capacity, refillPerSecond } = opts;
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user: any = (req as any).user;
      const orgId = user?.claims?.org_id || user?.organizationId || 'anon';
      const endpoint = `${req.method}:${req.path}`;
      const key = `rl:${orgId}:${endpoint}`;
      const now = Math.floor(Date.now() / 1000);
      const script = `
local key=KEYS[1]
local tskey=KEYS[2]
local cap=tonumber(ARGV[1])
local rate=tonumber(ARGV[2])
local now=tonumber(ARGV[3])
local tokens=tonumber(redis.call('GET', key) or cap)
local last=tonumber(redis.call('GET', tskey) or now)
local delta=math.max(0, now - last)
local filled=math.min(cap, tokens + delta*rate)
if filled < 1 then
  redis.call('SET', key, filled)
  redis.call('SET', tskey, now)
  return 0
else
  redis.call('SET', key, filled - 1)
  redis.call('SET', tskey, now)
  return 1
end
`;
      const allowed = await redis.eval(script, 2, `${key}:tokens`, `${key}:ts`, String(capacity), String(refillPerSecond), String(now));
      if (!allowed) return res.status(429).json({ message: 'Rate limit exceeded' });
      next();
    } catch (e) {
      next();
    }
  };
}
