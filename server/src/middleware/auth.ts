import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'hotelblock_secret_2024';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string; name: string };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string; name: string };
    req.user = payload;
    const url = req.originalUrl || '';
    const agentAllowed = url.startsWith('/api/auth') || url.startsWith('/api/agent-portal');
    if (payload.role === 'agent' && !agentAllowed) {
      return res.status(403).json({ error: 'Agents use their own portal' });
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function requireManagerOrAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!['admin', 'manager'].includes(req.user?.role || '')) {
    return res.status(403).json({ error: 'Manager or Admin access required' });
  }
  next();
}

/** Sales executives and call-center staff see only their own calls, meetings, and similar records. */
export function ownScope(role?: string | null): boolean {
  return role === 'executive' || role === 'call_center';
}

/** Executives and call-center staff may only touch rows they own. Managers and admins may touch any row. Returns true if the response was already sent. */
export function denyUnlessOwner(req: AuthRequest, res: Response, ownerId: string | null | undefined): boolean {
  if (ownScope(req.user?.role) && ownerId !== req.user?.id) {
    res.status(403).json({ error: 'You can only access your own records' });
    return true;
  }
  return false;
}

export { JWT_SECRET };
