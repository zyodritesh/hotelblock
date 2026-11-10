import { Router, Response } from 'express';
import db from '../db';
import { authenticate, ownScope, AuthRequest } from '../middleware/auth';
import { salesPlanReport } from '../salesTeam';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  const only = ownScope(req.user!.role) ? req.user!.id : undefined;
  const report = salesPlanReport(db, month, only);
  return res.json(report);
});

export default router;
