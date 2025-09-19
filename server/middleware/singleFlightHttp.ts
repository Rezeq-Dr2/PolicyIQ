import type { Request, Response, NextFunction } from 'express';
import { redis } from '../services/queue';
import crypto from 'crypto';

export function singleFlightHttp(options: { windowSeconds?: number; keyFn?: (req: Request) => string }) {
  const ttl = Math.max(1, options.windowSeconds || 30);
  return async function(req: Request, res: Response, next: NextFunction) {
    try {
      const base = options.keyFn ? options.keyFn(req) : `${req.method}:${req.path}:${JSON.stringify(req.body||{})}`;
      const key = 'sfh:' + crypto.createHash('sha256').update(base).digest('hex').slice(0, 32);
      const existing = await redis.get(key);
      if (existing) {
        res.setHeader('x-singleflight', 'deduped');
        return res.status(202).json({ message: 'Duplicate request suppressed', key });
      }
      await redis.set(key, '1', 'EX', ttl, 'NX');
      res.on('finish', async () => { try { await redis.del(key); } catch {} });
      next();
    } catch { next(); }
  };
}


