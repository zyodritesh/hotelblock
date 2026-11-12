import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, requireManagerOrAdmin, ownScope, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const { user_id, month } = req.query as Record<string, string>;
  let q = `SELECT t.*, u.name as user_name FROM targets t LEFT JOIN users u ON t.user_id=u.id WHERE 1=1`;
  const params: any[] = [];
  if (ownScope(req.user!.role)) { q += ' AND t.user_id = ?'; params.push(req.user!.id); }
  else if (user_id) { q += ' AND t.user_id = ?'; params.push(user_id); }
  if (month) { q += ' AND t.month = ?'; params.push(month); }
  q += ' ORDER BY t.month DESC, u.name';
  return res.json(db.prepare(q).all(...params));
});

router.post('/', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const { user_id, month, segment, calls_target, meetings_target, revenue_target } = req.body;
  if (!user_id || !month) return res.status(400).json({ error: 'user_id, month required' });
  const existing = db.prepare('SELECT id FROM targets WHERE user_id=? AND month=? AND segment=?').get(user_id, month, segment||'All') as any;
  if (existing) {
    db.prepare('UPDATE targets SET calls_target=?,meetings_target=?,revenue_target=? WHERE id=?').run(calls_target||0, meetings_target||0, revenue_target||0, existing.id);
    return res.json(db.prepare('SELECT * FROM targets WHERE id=?').get(existing.id));
  }
  const id = uuidv4();
  db.prepare('INSERT INTO targets (id,user_id,month,segment,calls_target,meetings_target,revenue_target,created_by) VALUES (?,?,?,?,?,?,?,?)').run(
    id, user_id, month, segment||'All', calls_target||0, meetings_target||0, revenue_target||0, req.user!.id
  );
  return res.status(201).json(db.prepare('SELECT * FROM targets WHERE id=?').get(id));
});

router.get('/scores', (req: AuthRequest, res: Response) => {
  const { user_id, month } = req.query as Record<string, string>;
  let q = `SELECT r.*, u.name as user_name FROM review_scores r LEFT JOIN users u ON r.user_id=u.id WHERE 1=1`;
  const params: any[] = [];
  if (ownScope(req.user!.role)) { q += ' AND r.user_id = ?'; params.push(req.user!.id); }
  else if (user_id) { q += ' AND r.user_id = ?'; params.push(user_id); }
  if (month) { q += ' AND r.month = ?'; params.push(month); }
  q += ' ORDER BY r.month DESC';
  return res.json(db.prepare(q).all(...params));
});

router.post('/calculate-score', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const { user_id, month } = req.body;
  if (!user_id || !month) return res.status(400).json({ error: 'user_id, month required' });

  const targets = db.prepare("SELECT * FROM targets WHERE user_id=? AND month=? AND segment='All'").get(user_id, month) as any;
  if (!targets) return res.status(400).json({ error: 'No targets set for this user/month' });

  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  const callsDone = (db.prepare("SELECT COUNT(*) as c FROM calls WHERE user_id=? AND date(created_at) BETWEEN ? AND ?").get(user_id, monthStart, monthEnd) as any).c;
  const meetingsDone = (db.prepare("SELECT COUNT(*) as c FROM meetings WHERE user_id=? AND date(meeting_date) BETWEEN ? AND ?").get(user_id, monthStart, monthEnd) as any).c;
  const revenueClosedRow = db.prepare("SELECT COALESCE(SUM(estimated_revenue),0) as total FROM leads WHERE user_id=? AND stage IN ('Closed Won') AND date(updated_at) BETWEEN ? AND ?").get(user_id, monthStart, monthEnd) as any;
  const revenueClosed = revenueClosedRow.total;
  const openLeads = (db.prepare("SELECT COUNT(*) as c FROM leads WHERE user_id=? AND stage NOT IN ('Closed Won','Closed Lost')").get(user_id) as any).c;

  const callsScore = targets.calls_target > 0 ? Math.min(100, (callsDone / targets.calls_target) * 100) : 100;
  const meetingsScore = targets.meetings_target > 0 ? Math.min(100, (meetingsDone / targets.meetings_target) * 100) : 100;
  const revenueScore = targets.revenue_target > 0 ? Math.min(100, (revenueClosed / targets.revenue_target) * 100) : 100;
  const pipelineScore = Math.min(100, openLeads * 10);

  const total = callsScore * 0.25 + meetingsScore * 0.20 + revenueScore * 0.35 + pipelineScore * 0.20;
  const grade = total >= 90 ? 'A' : total >= 75 ? 'B' : total >= 60 ? 'C' : 'D';
  const now = new Date().toISOString();

  const existing = db.prepare('SELECT id FROM review_scores WHERE user_id=? AND month=?').get(user_id, month) as any;
  if (existing) {
    db.prepare('UPDATE review_scores SET calls_score=?,meetings_score=?,revenue_score=?,pipeline_score=?,total_score=?,grade=?,updated_at=? WHERE id=?').run(
      callsScore, meetingsScore, revenueScore, pipelineScore, total, grade, now, existing.id
    );
    return res.json(db.prepare('SELECT * FROM review_scores WHERE id=?').get(existing.id));
  }
  const id = uuidv4();
  db.prepare('INSERT INTO review_scores (id,user_id,month,calls_score,meetings_score,revenue_score,pipeline_score,total_score,grade,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
    id, user_id, month, callsScore, meetingsScore, revenueScore, pipelineScore, total, grade, now, now
  );
  return res.json(db.prepare('SELECT * FROM review_scores WHERE id=?').get(id));
});

router.put('/scores/:id', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const { admin_note } = req.body;
  db.prepare('UPDATE review_scores SET admin_note=?, updated_at=? WHERE id=?').run(admin_note, new Date().toISOString(), req.params.id);
  return res.json(db.prepare('SELECT * FROM review_scores WHERE id=?').get(req.params.id));
});

export default router;
