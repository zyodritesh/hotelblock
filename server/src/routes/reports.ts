import { Router, Response } from 'express';
import db from '../db';
import { authenticate, ownScope, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

function hotelSql(raw: string | undefined, column = 'property_id') {
  if (!raw) return '';
  const row = db.prepare('SELECT id FROM properties WHERE id=?').get(raw) as { id: string } | undefined;
  return row ? ` AND ${column} = '${row.id}'` : '';
}

router.get('/dashboard', (req: AuthRequest, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const userId = req.user!.id;
  const role = req.user!.role;

  const userFilter = ownScope(role) ? `AND user_id = '${userId}'` : '';
  const leadFilter = ownScope(role)
    ? `AND (user_id = '${userId}' OR created_by = '${userId}' OR id IN (SELECT lead_id FROM lead_owners WHERE user_id = '${userId}'))`
    : '';
  const callsToday = (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE date(created_at) = ? ${userFilter}`).get(today) as any).c;
  const callsWeek = (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE date(created_at) >= ? ${userFilter}`).get(weekAgo) as any).c;
  const openLeads = (db.prepare(`SELECT COUNT(*) as c FROM leads WHERE stage NOT IN ('Closed Won','Closed Lost') ${leadFilter}`).get() as any).c;
  const pipelineValue = (db.prepare(`SELECT COALESCE(SUM(estimated_revenue),0) as total FROM leads WHERE stage NOT IN ('Closed Won','Closed Lost') ${leadFilter}`).get() as any).total;
  const closedRevenueMTD = (db.prepare(`SELECT COALESCE(SUM(estimated_revenue),0) as total FROM leads WHERE stage='Closed Won' AND date(updated_at) >= ? ${userFilter}`).get(monthStart) as any).total;
  const meetingsToday = (db.prepare(`SELECT COUNT(*) as c FROM meetings WHERE date(meeting_date) = ? ${userFilter}`).get(today) as any).c;

  const pipelineByStage = db.prepare(`SELECT stage, COUNT(*) as count, COALESCE(SUM(estimated_revenue),0) as value FROM leads WHERE stage NOT IN ('Closed Won','Closed Lost') ${leadFilter} GROUP BY stage`).all();
  const pipelineBySegment = db.prepare(`SELECT segment, COUNT(*) as count, COALESCE(SUM(estimated_revenue),0) as value FROM leads ${leadFilter.replace('AND','WHERE')||'WHERE 1=1'} GROUP BY segment`).all();
  const recentCalls = db.prepare(`SELECT c.*, u.name as user_name FROM calls c LEFT JOIN users u ON c.user_id=u.id ${ownScope(role)?'WHERE c.user_id=?':''} ORDER BY c.created_at DESC LIMIT 5`).all(...(ownScope(role)?[userId]:[]));
  const upcomingTasks = db.prepare(`SELECT t.*, u.name as user_name FROM tasks t LEFT JOIN users u ON t.user_id=u.id WHERE t.completed=0 ${ownScope(role)?`AND t.user_id='${userId}'`:''} ORDER BY t.due_date ASC LIMIT 10`).all();

  const todayAttendance = ownScope(role)
    ? db.prepare(`SELECT a.*, u.name as user_name FROM attendance a LEFT JOIN users u ON a.user_id=u.id WHERE a.date=? AND a.user_id=?`).all(today, userId)
    : db.prepare(`SELECT a.*, u.name as user_name FROM attendance a LEFT JOIN users u ON a.user_id=u.id WHERE a.date=?`).all(today);

  return res.json({ callsToday, callsWeek, openLeads, pipelineValue, closedRevenueMTD, meetingsToday, pipelineByStage, pipelineBySegment, recentCalls, upcomingTasks, todayAttendance });
});

router.get('/calls-summary', (req: AuthRequest, res: Response) => {
  const { from, to, user_id, property_id } = req.query as Record<string, string>;
  const userId = ownScope(req.user!.role) ? req.user!.id : (user_id || null);
  const userFilter = userId ? `AND user_id = '${userId}'` : '';
  const dateFilter = from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) ? `AND date(created_at) BETWEEN '${from}' AND '${to}'` : '';
  const hotel = hotelSql(property_id);
  const bySegment = db.prepare(`SELECT segment, COUNT(*) as count FROM calls WHERE 1=1 ${userFilter} ${dateFilter} ${hotel} GROUP BY segment`).all();
  const byOutcome = db.prepare(`SELECT outcome, COUNT(*) as count FROM calls WHERE 1=1 ${userFilter} ${dateFilter} ${hotel} GROUP BY outcome`).all();
  const byDay = db.prepare(`SELECT date(created_at) as day, COUNT(*) as count FROM calls WHERE 1=1 ${userFilter} ${dateFilter} ${hotel} GROUP BY day ORDER BY day`).all();
  return res.json({ bySegment, byOutcome, byDay });
});

router.get('/revenue', (req: AuthRequest, res: Response) => {
  const propertyId = String(req.query.property_id || '');
  const userId = ownScope(req.user!.role) ? req.user!.id : null;
  const userFilter = userId ? `AND user_id = '${userId}'` : '';
  const hotel = hotelSql(propertyId);
  const monthly = db.prepare(`SELECT strftime('%Y-%m', updated_at) as month, COALESCE(SUM(estimated_revenue),0) as revenue FROM leads WHERE stage='Closed Won' ${userFilter} ${hotel} GROUP BY month ORDER BY month DESC LIMIT 12`).all();
  return res.json({ monthly });
});

router.get('/hotels', (req: AuthRequest, res: Response) => {
  const { from, to } = req.query as Record<string, string>;
  const dated = from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);
  const me = ownScope(req.user!.role) ? req.user!.id : null;
  const hotels = db.prepare('SELECT id, name, city FROM properties WHERE active=1 ORDER BY name').all() as { id: string; name: string; city: string }[];
  const rows = hotels.map(hotel => {
    const leadScope = me
      ? `AND (user_id=? OR created_by=? OR id IN (SELECT lead_id FROM lead_owners WHERE user_id=?))`
      : '';
    const leadParams = me ? [hotel.id, me, me, me] : [hotel.id];
    const open = db.prepare(`SELECT COUNT(*) as c, COALESCE(SUM(estimated_revenue),0) as value FROM leads WHERE property_id=? AND stage NOT IN ('Closed Won','Closed Lost') ${leadScope}`).get(...leadParams) as { c: number; value: number };
    const closedSql = `SELECT COUNT(*) as c, COALESCE(SUM(estimated_revenue),0) as value FROM leads WHERE property_id=? AND stage='Closed Won' ${me ? 'AND user_id=?' : ''} ${dated ? 'AND date(updated_at) BETWEEN ? AND ?' : ''}`;
    const closedParams = [hotel.id, ...(me ? [me] : []), ...(dated ? [from, to] : [])];
    const closed = db.prepare(closedSql).get(...closedParams) as { c: number; value: number };
    const callSql = `SELECT COUNT(*) as c FROM calls WHERE property_id=? ${me ? 'AND user_id=?' : ''} ${dated ? 'AND date(created_at) BETWEEN ? AND ?' : ''}`;
    const calls = (db.prepare(callSql).get(...closedParams) as { c: number }).c;
    const proposals = (db.prepare(`SELECT COUNT(*) as c FROM proposals WHERE property_id=? ${me ? 'AND user_id=?' : ''}`).get(...(me ? [hotel.id, me] : [hotel.id])) as { c: number }).c;
    return {
      id: hotel.id,
      name: hotel.name,
      city: hotel.city,
      open_leads: open.c,
      pipeline: open.value,
      closed_count: closed.c,
      closed_revenue: closed.value,
      calls,
      proposals,
    };
  });
  return res.json(rows);
});

router.get('/leaderboard', (req: AuthRequest, res: Response) => {
  const month = new Date().toISOString().slice(0, 7);
  const users = (ownScope(req.user!.role)
    ? db.prepare('SELECT id, name, role FROM users WHERE id=?').all(req.user!.id)
    : req.user!.role === 'manager'
      ? db.prepare("SELECT id, name, role FROM users WHERE active=1 AND role IN ('executive','manager')").all()
      : db.prepare("SELECT id, name, role FROM users WHERE active=1 AND role != 'agent'").all()) as any[];
  const leaderboard = users.map((u: any) => {
    const monthStart = `${month}-01`, monthEnd = `${month}-31`;
    const hotel = String(req.query.property_id || '');
    const hotelOk = hotel ? db.prepare('SELECT id FROM properties WHERE id=?').get(hotel) as { id: string } | undefined : undefined;
    const calls = hotelOk
      ? (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE user_id=? AND property_id=? AND date(created_at) BETWEEN ? AND ?`).get(u.id, hotelOk.id, monthStart, monthEnd) as any).c
      : (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE user_id=? AND date(created_at) BETWEEN ? AND ?`).get(u.id, monthStart, monthEnd) as any).c;
    const meetings = (db.prepare(`SELECT COUNT(*) as c FROM meetings WHERE user_id=? AND date(meeting_date) BETWEEN ? AND ?`).get(u.id, monthStart, monthEnd) as any).c;
    const revenue = hotelOk
      ? (db.prepare(`SELECT COALESCE(SUM(estimated_revenue),0) as total FROM leads WHERE user_id=? AND property_id=? AND stage='Closed Won' AND date(updated_at) BETWEEN ? AND ?`).get(u.id, hotelOk.id, monthStart, monthEnd) as any).total
      : (db.prepare(`SELECT COALESCE(SUM(estimated_revenue),0) as total FROM leads WHERE user_id=? AND stage='Closed Won' AND date(updated_at) BETWEEN ? AND ?`).get(u.id, monthStart, monthEnd) as any).total;
    const score = db.prepare(`SELECT total_score, grade FROM review_scores WHERE user_id=? AND month=?`).get(u.id, month) as any;
    return { ...u, calls, meetings, revenue, score: score?.total_score || 0, grade: score?.grade || '-' };
  });
  leaderboard.sort((a: any, b: any) => b.revenue - a.revenue);
  return res.json(leaderboard);
});

router.get('/travel', (req: AuthRequest, res: Response) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const dated = DAY.test(from) && DAY.test(to);
  const params: any[] = [];
  let where = 'WHERE 1=1';
  if (ownScope(req.user!.role)) { where += ' AND p.user_id=?'; params.push(req.user!.id); }
  if (dated) { where += ' AND p.end_date>=? AND p.start_date<=?'; params.push(from, to); }
  const rows = db.prepare(`
    SELECT u.name AS person, p.city, p.start_date, p.end_date,
           s.agent_name, s.agency_name, s.stage, s.meet_date, s.meet_time
    FROM travel_stops s
    JOIN travel_plans p ON p.id = s.plan_id
    JOIN users u ON u.id = p.user_id
    ${where}
    ORDER BY p.start_date, u.name, s.meet_date, s.agent_name
  `).all(...params) as any[];
  const people = new Map<string, { person: string; planned: number; to_schedule: number; confirmed: number; met: number; missed: number }>();
  const summary = { trips: 0, planned: 0, to_schedule: 0, confirmed: 0, met: 0, missed: 0 };
  const tripKeys = new Set<string>();
  for (const row of rows) {
    const key = `${row.person}|${row.city}|${row.start_date}`;
    tripKeys.add(key);
    const bucket = people.get(row.person) || { person: row.person, planned: 0, to_schedule: 0, confirmed: 0, met: 0, missed: 0 };
    if (bucket[row.stage as keyof typeof bucket] !== undefined && row.stage !== 'person') {
      (bucket as any)[row.stage] += 1;
      (summary as any)[row.stage] += 1;
    }
    people.set(row.person, bucket);
  }
  summary.trips = tripKeys.size;
  return res.json({ summary, people: [...people.values()], rows });
});

const DAY = /^\d{4}-\d{2}-\d{2}$/;

router.get('/attendance-summary', (req: AuthRequest, res: Response) => {
  const { month } = req.query as Record<string, string>;
  const m = month || new Date().toISOString().slice(0, 7);
  if (ownScope(req.user!.role)) {
    const q = `SELECT a.user_id, u.name, COUNT(*) as total_days, SUM(a.is_late) as late_days FROM attendance a LEFT JOIN users u ON a.user_id=u.id WHERE a.date LIKE ? AND a.user_id=? GROUP BY a.user_id`;
    return res.json(db.prepare(q).all(`${m}%`, req.user!.id));
  }
  const q = `SELECT a.user_id, u.name, COUNT(*) as total_days, SUM(a.is_late) as late_days FROM attendance a LEFT JOIN users u ON a.user_id=u.id WHERE a.date LIKE ? GROUP BY a.user_id`;
  return res.json(db.prepare(q).all(`${m}%`));
});

export default router;
