import { Router, Response } from 'express';
import db from '../db';
import { authenticate, ownScope, requireAdmin, AuthRequest } from '../middleware/auth';
import { salesPlanReport, saveSalesPlan, createSalesPlan, deleteSalesPlan } from '../salesTeam';
import { TASK_METRICS, insertTaskIncentive, updateTaskIncentive, postTaskIncentive } from '../taskIncentives';

const router = Router();
router.use(authenticate);

function monthOk(month: string) {
  return /^\d{4}-\d{2}$/.test(month || '');
}

router.get('/task-metrics', (_req: AuthRequest, res: Response) => {
  return res.json(TASK_METRICS);
});

router.get('/', (req: AuthRequest, res: Response) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  if (!monthOk(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  const only = ownScope(req.user!.role) ? req.user!.id : undefined;
  const report = salesPlanReport(db, month, only, only ? undefined : {
    q: String(req.query.q || ''),
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  });
  return res.json(report);
});

router.post('/', requireAdmin, (req: AuthRequest, res: Response) => {
  const month = String(req.body.month || '');
  const userId = String(req.body.user_id || '');
  if (!monthOk(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  if (!userId) return res.status(400).json({ error: 'Choose a person' });
  const saved = createSalesPlan(db, userId, month, req.body, req.user!.id);
  if ('error' in saved) {
    const status = saved.error.includes('already has') ? 409 : 400;
    return res.status(status).json(saved);
  }
  return res.status(201).json(salesPlanReport(db, month, userId));
});

router.put('/:userId', requireAdmin, (req: AuthRequest, res: Response) => {
  const month = String(req.body.month || '');
  if (!monthOk(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  const person = db.prepare('SELECT id FROM users WHERE id=? AND active=1').get(req.params.userId);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  const saved = saveSalesPlan(db, req.params.userId, month, req.body, req.user!.id);
  if ('error' in saved) return res.status(404).json(saved);
  return res.json(salesPlanReport(db, month, req.params.userId));
});

router.delete('/:userId', requireAdmin, (req: AuthRequest, res: Response) => {
  const month = String(req.query.month || '');
  if (!monthOk(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  const saved = deleteSalesPlan(db, req.params.userId, month);
  if ('error' in saved) return res.status(404).json(saved);
  return res.json({ success: true });
});

router.post('/:userId/incentives', requireAdmin, (req: AuthRequest, res: Response) => {
  const month = String(req.body.month || '');
  if (!monthOk(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  const person = db.prepare('SELECT id FROM users WHERE id=? AND active=1').get(req.params.userId);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  const plan = db.prepare('SELECT id FROM sales_plans WHERE user_id=? AND month=?').get(req.params.userId, month);
  if (!plan) return res.status(400).json({ error: 'Create this person’s plan for the month first' });
  const saved = insertTaskIncentive(db, req.params.userId, month, req.body, req.user!.id);
  if ('error' in saved) return res.status(400).json(saved);
  return res.status(201).json(salesPlanReport(db, month, req.params.userId));
});

router.put('/:userId/incentives/:incentiveId', requireAdmin, (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT * FROM person_incentives WHERE id=? AND user_id=?').get(req.params.incentiveId, req.params.userId) as { month: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Incentive not found' });
  const saved = updateTaskIncentive(db, req.params.incentiveId, req.body);
  if ('error' in saved) return res.status(400).json(saved);
  return res.json(salesPlanReport(db, row.month, req.params.userId));
});

router.delete('/:userId/incentives/:incentiveId', requireAdmin, (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT month FROM person_incentives WHERE id=? AND user_id=?').get(req.params.incentiveId, req.params.userId) as { month: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Incentive not found' });
  db.prepare('DELETE FROM person_incentives WHERE id=?').run(req.params.incentiveId);
  return res.json(salesPlanReport(db, row.month, req.params.userId));
});

router.post('/:userId/incentives/:incentiveId/post', requireAdmin, (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT id FROM person_incentives WHERE id=? AND user_id=?').get(req.params.incentiveId, req.params.userId);
  if (!row) return res.status(404).json({ error: 'Incentive not found' });
  const posted = postTaskIncentive(db, req.params.incentiveId, req.user!.id);
  if ('error' in posted) return res.status(posted.status || 400).json({ error: posted.error });
  return res.json(posted);
});

export default router;
