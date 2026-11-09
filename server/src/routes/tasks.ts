import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, ownScope, AuthRequest } from '../middleware/auth';
import { followUpDate } from '../dates';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const { completed, user_id } = req.query as Record<string, string>;
  let q = `SELECT t.*, u.name as user_name FROM tasks t LEFT JOIN users u ON t.user_id=u.id WHERE 1=1`;
  const params: any[] = [];
  if (ownScope(req.user!.role)) { q += ' AND t.user_id = ?'; params.push(req.user!.id); }
  else if (user_id) { q += ' AND t.user_id = ?'; params.push(user_id); }
  if (completed !== undefined) { q += ' AND t.completed = ?'; params.push(completed === 'true' ? 1 : 0); }
  q += ' ORDER BY t.due_date ASC, t.created_at ASC';
  return res.json(db.prepare(q).all(...params));
});

router.post('/', (req: AuthRequest, res: Response) => {
  const { lead_id, call_id, title, due_date, user_id } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const parsedDue = followUpDate(due_date);
  if (parsedDue.error) return res.status(400).json({ error: parsedDue.error });
  const id = uuidv4();
  const assignTo = (!ownScope(req.user!.role) && user_id) ? user_id : req.user!.id;
  db.prepare('INSERT INTO tasks (id,lead_id,call_id,user_id,title,due_date) VALUES (?,?,?,?,?,?)').run(id, lead_id||null, call_id||null, assignTo, title, parsedDue.date);
  return res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id=?').get(id));
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Not found' });
  if (ownScope(req.user!.role) && task.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
  const { title, due_date, completed } = req.body;
  let due = task.due_date;
  if (due_date !== undefined) {
    const same = String(due_date || '').slice(0, 10) === String(task.due_date || '').slice(0, 10);
    if (!same) {
      const parsedDue = followUpDate(due_date);
      if (parsedDue.error) return res.status(400).json({ error: parsedDue.error });
      due = parsedDue.date;
    }
  }
  db.prepare('UPDATE tasks SET title=?,due_date=?,completed=? WHERE id=?').run(title??task.title, due, completed!==undefined?(completed?1:0):task.completed, req.params.id);
  return res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id));
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Not found' });
  if (ownScope(req.user!.role) && task.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
  return res.json({ success: true });
});

export default router;
