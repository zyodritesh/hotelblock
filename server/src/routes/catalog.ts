import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (_req: AuthRequest, res: Response) => {
  const sections = db.prepare('SELECT * FROM proposal_sections WHERE active=1 ORDER BY sort_order, name').all();
  const items = db.prepare(`SELECT t.*, s.name as section_name FROM proposal_item_templates t
    JOIN proposal_sections s ON s.id = t.section_id
    WHERE t.active=1 AND s.active=1
    ORDER BY s.sort_order, t.description`).all();
  const terms = db.prepare('SELECT * FROM terms_templates WHERE active=1 ORDER BY is_default DESC, name').all();
  return res.json({ sections, items, terms });
});

router.post('/sections', requireAdmin, (req: AuthRequest, res: Response) => {
  const { name, sort_order } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  const order = sort_order ?? ((db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM proposal_sections').get() as any).m + 1);
  try {
    db.prepare('INSERT INTO proposal_sections (id, name, sort_order) VALUES (?,?,?)').run(id, name.trim(), order);
  } catch {
    return res.status(400).json({ error: 'A section with this name already exists' });
  }
  return res.status(201).json(db.prepare('SELECT * FROM proposal_sections WHERE id=?').get(id));
});

router.put('/sections/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT * FROM proposal_sections WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { name, sort_order, active } = req.body;
  db.prepare('UPDATE proposal_sections SET name=?, sort_order=?, active=? WHERE id=?').run(
    (name ?? row.name).trim(), sort_order ?? row.sort_order, active ?? row.active, req.params.id
  );
  return res.json(db.prepare('SELECT * FROM proposal_sections WHERE id=?').get(req.params.id));
});

router.delete('/sections/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  db.prepare('UPDATE proposal_sections SET active=0 WHERE id=?').run(req.params.id);
  return res.json({ success: true });
});

router.post('/items', requireAdmin, (req: AuthRequest, res: Response) => {
  const { section_id, description, default_rate } = req.body;
  if (!section_id || !description?.trim()) return res.status(400).json({ error: 'section and description required' });
  const id = uuidv4();
  db.prepare('INSERT INTO proposal_item_templates (id, section_id, description, default_rate) VALUES (?,?,?,?)').run(
    id, section_id, description.trim(), Number(default_rate) || 0
  );
  return res.status(201).json(db.prepare(`SELECT t.*, s.name as section_name FROM proposal_item_templates t JOIN proposal_sections s ON s.id=t.section_id WHERE t.id=?`).get(id));
});

router.put('/items/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT * FROM proposal_item_templates WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { section_id, description, default_rate, active } = req.body;
  db.prepare('UPDATE proposal_item_templates SET section_id=?, description=?, default_rate=?, active=? WHERE id=?').run(
    section_id ?? row.section_id, (description ?? row.description).trim(), default_rate ?? row.default_rate, active ?? row.active, req.params.id
  );
  return res.json(db.prepare(`SELECT t.*, s.name as section_name FROM proposal_item_templates t JOIN proposal_sections s ON s.id=t.section_id WHERE t.id=?`).get(req.params.id));
});

router.delete('/items/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  db.prepare('UPDATE proposal_item_templates SET active=0 WHERE id=?').run(req.params.id);
  return res.json({ success: true });
});

router.post('/terms', requireAdmin, (req: AuthRequest, res: Response) => {
  const { name, body, is_default } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  if (is_default) db.prepare('UPDATE terms_templates SET is_default=0').run();
  db.prepare('INSERT INTO terms_templates (id, name, body, is_default) VALUES (?,?,?,?)').run(id, name.trim(), body || '', is_default ? 1 : 0);
  return res.status(201).json(db.prepare('SELECT * FROM terms_templates WHERE id=?').get(id));
});

router.put('/terms/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT * FROM terms_templates WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { name, body, is_default, active } = req.body;
  const makeDefault = is_default === true || is_default === 1;
  if (makeDefault) db.prepare('UPDATE terms_templates SET is_default=0').run();
  const nextDefault = is_default === undefined ? row.is_default : (makeDefault ? 1 : 0);
  db.prepare('UPDATE terms_templates SET name=?, body=?, is_default=?, active=?, updated_at=? WHERE id=?').run(
    (name ?? row.name).trim(), body ?? row.body, nextDefault,
    active ?? row.active, new Date().toISOString(), req.params.id
  );
  return res.json(db.prepare('SELECT * FROM terms_templates WHERE id=?').get(req.params.id));
});

router.delete('/terms/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  db.prepare('UPDATE terms_templates SET active=0, is_default=0 WHERE id=?').run(req.params.id);
  return res.json({ success: true });
});

export default router;
