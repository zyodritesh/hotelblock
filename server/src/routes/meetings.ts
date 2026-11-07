import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const uploadDir = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const { user_id, segment, from, to, search, limit = '50', offset = '0' } = req.query as Record<string, string>;
  let base = `FROM meetings m LEFT JOIN users u ON m.user_id = u.id WHERE 1=1`;
  const params: any[] = [];
  if (req.user!.role === 'executive') { base += ' AND m.user_id = ?'; params.push(req.user!.id); }
  else if (user_id) { base += ' AND m.user_id = ?'; params.push(user_id); }
  if (segment) { base += ' AND m.segment = ?'; params.push(segment); }
  if (from) { base += ' AND date(m.meeting_date) >= ?'; params.push(from); }
  if (to) { base += ' AND date(m.meeting_date) <= ?'; params.push(to); }
  if (search) { base += ' AND (m.contact_name LIKE ? OR m.company LIKE ?)'; const s = `%${search}%`; params.push(s, s); }
  const total = (db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params) as any).c;
  const rows = db.prepare(`SELECT m.*, u.name as user_name ${base} ORDER BY m.meeting_date DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), parseInt(offset));
  return res.json({ data: rows, total });
});

router.post('/', upload.single('photo'), (req: AuthRequest, res: Response) => {
  const { contact_name, company, contact_id, segment, purpose, outcome, notes, lat, lng, address_label, meeting_date } = req.body;
  if (!segment) return res.status(400).json({ error: 'segment required' });
  const id = uuidv4();
  const photo_path = req.file ? `/uploads/${req.file.filename}` : null;
  db.prepare(`INSERT INTO meetings (id,contact_id,contact_name,company,user_id,segment,purpose,outcome,notes,photo_path,lat,lng,address_label,meeting_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, contact_id||null, contact_name||'', company||'', req.user!.id, segment,
    purpose||'', outcome||'', notes||'', photo_path,
    lat ? parseFloat(lat) : null, lng ? parseFloat(lng) : null, address_label||'',
    meeting_date || new Date().toISOString()
  );
  return res.status(201).json(db.prepare('SELECT * FROM meetings WHERE id=?').get(id));
});

router.put('/:id', upload.single('photo'), (req: AuthRequest, res: Response) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE id=?').get(req.params.id) as any;
  if (!meeting) return res.status(404).json({ error: 'Not found' });
  if (req.user!.role === 'executive' && meeting.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
  const { contact_name, company, segment, purpose, outcome, notes, lat, lng, address_label, meeting_date } = req.body;
  const photo_path = req.file ? `/uploads/${req.file.filename}` : meeting.photo_path;
  db.prepare(`UPDATE meetings SET contact_name=?,company=?,segment=?,purpose=?,outcome=?,notes=?,photo_path=?,lat=?,lng=?,address_label=?,meeting_date=? WHERE id=?`).run(
    contact_name??meeting.contact_name, company??meeting.company, segment??meeting.segment,
    purpose??meeting.purpose, outcome??meeting.outcome, notes??meeting.notes, photo_path,
    lat ? parseFloat(lat) : meeting.lat, lng ? parseFloat(lng) : meeting.lng,
    address_label??meeting.address_label, meeting_date??meeting.meeting_date, req.params.id
  );
  return res.json(db.prepare('SELECT * FROM meetings WHERE id=?').get(req.params.id));
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE id=?').get(req.params.id) as any;
  if (!meeting) return res.status(404).json({ error: 'Not found' });
  if (req.user!.role === 'executive' && meeting.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM meetings WHERE id=?').run(req.params.id);
  return res.json({ success: true });
});

export default router;
