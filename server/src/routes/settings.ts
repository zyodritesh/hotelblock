import { Router, Response } from 'express';
import db from '../db';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (_req: AuthRequest, res: Response) => {
  const rows = db.prepare('SELECT * FROM settings').all() as any[];
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  return res.json(result);
});

router.put('/', requireAdmin, (req: AuthRequest, res: Response) => {
  const updates = req.body as Record<string, string>;
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(updates)) upsert.run(k, v);
  });
  tx();
  const rows = db.prepare('SELECT * FROM settings').all() as any[];
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  return res.json(result);
});

export default router;
