import { Router, Response } from 'express';
import db from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/dashboard', (req: AuthRequest, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const userId = req.user!.id;
  const role = req.user!.role;

  const userFilter = role === 'executive' ? `AND user_id = '${userId}'` : '';
  const callsToday = (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE date(created_at) = ? ${userFilter}`).get(today) as any).c;
  const callsWeek = (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE date(created_at) >= ? ${userFilter}`).get(weekAgo) as any).c;
  const openLeads = (db.prepare(`SELECT COUNT(*) as c FROM leads WHERE stage NOT IN ('Closed Won','Closed Lost') ${userFilter}`).get() as any).c;
  const pipelineValue = (db.prepare(`SELECT COALESCE(SUM(estimated_revenue),0) as total FROM leads WHERE stage NOT IN ('Closed Won','Closed Lost') ${userFilter}`).get() as any).total;
  const closedRevenueMTD = (db.prepare(`SELECT COALESCE(SUM(estimated_revenue),0) as total FROM leads WHERE stage='Closed Won' AND date(updated_at) >= ? ${userFilter}`).get(monthStart) as any).total;
  const meetingsToday = (db.prepare(`SELECT COUNT(*) as c FROM meetings WHERE date(meeting_date) = ? ${userFilter}`).get(today) as any).c;

  const pipelineByStage = db.prepare(`SELECT stage, COUNT(*) as count, COALESCE(SUM(estimated_revenue),0) as value FROM leads WHERE stage NOT IN ('Closed Won','Closed Lost') ${userFilter} GROUP BY stage`).all();
  const pipelineBySegment = db.prepare(`SELECT segment, COUNT(*) as count, COALESCE(SUM(estimated_revenue),0) as value FROM leads ${userFilter.replace('AND','WHERE')||'WHERE 1=1'} GROUP BY segment`).all();
  const recentCalls = db.prepare(`SELECT c.*, u.name as user_name FROM calls c LEFT JOIN users u ON c.user_id=u.id ${role==='executive'?'WHERE c.user_id=?':''} ORDER BY c.created_at DESC LIMIT 5`).all(...(role==='executive'?[userId]:[]));
  const upcomingTasks = db.prepare(`SELECT t.*, u.name as user_name FROM tasks t LEFT JOIN users u ON t.user_id=u.id WHERE t.completed=0 ${role==='executive'?`AND t.user_id='${userId}'`:''} ORDER BY t.due_date ASC LIMIT 10`).all();

  const todayAttendance = db.prepare(`SELECT a.*, u.name as user_name FROM attendance a LEFT JOIN users u ON a.user_id=u.id WHERE a.date=?`).all(today);

  return res.json({ callsToday, callsWeek, openLeads, pipelineValue, closedRevenueMTD, meetingsToday, pipelineByStage, pipelineBySegment, recentCalls, upcomingTasks, todayAttendance });
});

router.get('/calls-summary', (req: AuthRequest, res: Response) => {
  const { from, to, user_id } = req.query as Record<string, string>;
  const userId = req.user!.role === 'executive' ? req.user!.id : (user_id || null);
  const userFilter = userId ? `AND user_id = '${userId}'` : '';
  const dateFilter = from && to ? `AND date(created_at) BETWEEN '${from}' AND '${to}'` : '';
  const bySegment = db.prepare(`SELECT segment, COUNT(*) as count FROM calls WHERE 1=1 ${userFilter} ${dateFilter} GROUP BY segment`).all();
  const byOutcome = db.prepare(`SELECT outcome, COUNT(*) as count FROM calls WHERE 1=1 ${userFilter} ${dateFilter} GROUP BY outcome`).all();
  const byDay = db.prepare(`SELECT date(created_at) as day, COUNT(*) as count FROM calls WHERE 1=1 ${userFilter} ${dateFilter} GROUP BY day ORDER BY day`).all();
  return res.json({ bySegment, byOutcome, byDay });
});

router.get('/revenue', (req: AuthRequest, res: Response) => {
  const userId = req.user!.role === 'executive' ? req.user!.id : null;
  const userFilter = userId ? `AND user_id = '${userId}'` : '';
  const monthly = db.prepare(`SELECT strftime('%Y-%m', updated_at) as month, COALESCE(SUM(estimated_revenue),0) as revenue FROM leads WHERE stage='Closed Won' ${userFilter} GROUP BY month ORDER BY month DESC LIMIT 12`).all();
  return res.json({ monthly });
});

router.get('/leaderboard', (_req: AuthRequest, res: Response) => {
  const month = new Date().toISOString().slice(0, 7);
  const users = db.prepare('SELECT id, name, role FROM users WHERE active=1').all() as any[];
  const leaderboard = users.map((u: any) => {
    const monthStart = `${month}-01`, monthEnd = `${month}-31`;
    const calls = (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE user_id=? AND date(created_at) BETWEEN ? AND ?`).get(u.id, monthStart, monthEnd) as any).c;
    const meetings = (db.prepare(`SELECT COUNT(*) as c FROM meetings WHERE user_id=? AND date(meeting_date) BETWEEN ? AND ?`).get(u.id, monthStart, monthEnd) as any).c;
    const revenue = (db.prepare(`SELECT COALESCE(SUM(estimated_revenue),0) as total FROM leads WHERE user_id=? AND stage='Closed Won' AND date(updated_at) BETWEEN ? AND ?`).get(u.id, monthStart, monthEnd) as any).total;
    const score = db.prepare(`SELECT total_score, grade FROM review_scores WHERE user_id=? AND month=?`).get(u.id, month) as any;
    return { ...u, calls, meetings, revenue, score: score?.total_score || 0, grade: score?.grade || '-' };
  });
  leaderboard.sort((a: any, b: any) => b.revenue - a.revenue);
  return res.json(leaderboard);
});

router.get('/attendance-summary', (req: AuthRequest, res: Response) => {
  const { month } = req.query as Record<string, string>;
  const m = month || new Date().toISOString().slice(0, 7);
  let q = `SELECT a.user_id, u.name, COUNT(*) as total_days, SUM(a.is_late) as late_days FROM attendance a LEFT JOIN users u ON a.user_id=u.id WHERE a.date LIKE ? GROUP BY a.user_id`;
  return res.json(db.prepare(q).all(`${m}%`));
});

export default router;
