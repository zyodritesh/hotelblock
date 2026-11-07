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

export { JWT_SECRET };
