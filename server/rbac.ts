import type { RequestHandler } from 'express';
import { storage } from './storage';

type Role = 'admin' | 'editor' | 'viewer' | 'member';

function normalizeRole(role?: string | null): Exclude<Role, 'member'> | 'viewer' {
  const r = (role || '').toLowerCase();
  if (r === 'admin') return 'admin';
  if (r === 'editor') return 'editor';
  if (r === 'viewer') return 'viewer';
  if (r === 'member') return 'viewer';
  return 'viewer';
}

export const requireRoles = (...allowed: Array<'admin' | 'editor' | 'viewer'>): RequestHandler => {
  return async (req, res, next) => {
    try {
      const userId = (req as any).user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });

      const role = normalizeRole(user.role);
      // Role hierarchy: admin > editor > viewer
      const rank: Record<'viewer' | 'editor' | 'admin', number> = { viewer: 1, editor: 2, admin: 3 };
      const minRequired = Math.max(...allowed.map(r => rank[r]));
      const userRank = rank[role];
      if (userRank < minRequired) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      next();
    } catch (err) {
      console.error('RBAC error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
};


