import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../db';
import { authenticate, denyUnlessOwner, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

function getUploadDir(proposalId: string) {
  const dir = path.join(__dirname, '../../../uploads/proposals', proposalId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makePhotoUpload(proposalId: string) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, getUploadDir(proposalId)),
      filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
  });
}

function generateRefNumber(): string {
  const year = new Date().getFullYear();
  const count = (db.prepare("SELECT COUNT(*) as c FROM proposals").get() as any).c + 1;
  return `PROP-${year}-${String(count).padStart(3, '0')}`;
}

router.get('/', (req: AuthRequest, res: Response) => {
  const { user_id, status, property_id } = req.query as Record<string, string>;
  let q = `SELECT p.*, u.name as user_name, l.title as lead_title, l.segment,
    pr.name as property_name FROM proposals p
    LEFT JOIN users u ON p.user_id=u.id
    LEFT JOIN leads l ON p.lead_id=l.id
    LEFT JOIN properties pr ON p.property_id=pr.id
    WHERE 1=1`;
  const params: any[] = [];
  if (req.user!.role === 'executive') { q += ' AND p.user_id = ?'; params.push(req.user!.id); }
  else if (user_id) { q += ' AND p.user_id = ?'; params.push(user_id); }
  if (status) { q += ' AND p.status = ?'; params.push(status); }
  if (property_id) { q += ' AND p.property_id = ?'; params.push(property_id); }
  q += ' ORDER BY p.updated_at DESC';
  return res.json(db.prepare(q).all(...params));
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  const p = db.prepare(`SELECT p.*, u.name as user_name, l.title as lead_title,
    pr.name as property_name, pr.address as property_address, pr.city as property_city,
    pr.phone as property_phone, pr.email as property_email, pr.gst_number,
    pr.logo_path, pr.brand_color, pr.website
    FROM proposals p
    LEFT JOIN users u ON p.user_id=u.id
    LEFT JOIN leads l ON p.lead_id=l.id
    LEFT JOIN properties pr ON p.property_id=pr.id
    WHERE p.id=?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (denyUnlessOwner(req, res, (p as any).user_id)) return;
  return res.json(p);
});

router.post('/', (req: AuthRequest, res: Response) => {
  const {
    lead_id, property_id, title, status, client_name, client_company, client_phone, client_email,
    event_date, event_type, venue, pax, validity_date, payment_terms, cancellation_policy,
    tax_percent, discount, total_value, line_items, notes, terms
  } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const id = uuidv4();
  const now = new Date().toISOString();
  const ref_number = generateRefNumber();
  db.prepare(`INSERT INTO proposals
    (id,lead_id,user_id,property_id,title,ref_number,status,client_name,client_company,client_phone,client_email,
    event_date,event_type,venue,pax,validity_date,payment_terms,cancellation_policy,
    tax_percent,discount,total_value,line_items,photos,notes,terms,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, lead_id||null, req.user!.id, property_id||null, title, ref_number,
    status||'Draft', client_name||'', client_company||'', client_phone||'', client_email||'',
    event_date||null, event_type||'', venue||'', pax||0, validity_date||null,
    payment_terms||'', cancellation_policy||'', tax_percent??18, discount||0,
    total_value||0, JSON.stringify(line_items||[]), '[]', notes||'', terms||'', now, now
  );
  return res.status(201).json(db.prepare('SELECT * FROM proposals WHERE id=?').get(id));
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const p = db.prepare('SELECT * FROM proposals WHERE id=?').get(req.params.id) as any;
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (req.user!.role === 'executive' && p.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
  const {
    lead_id, property_id, title, status, client_name, client_company, client_phone, client_email,
    event_date, event_type, venue, pax, validity_date, payment_terms, cancellation_policy,
    tax_percent, discount, total_value, line_items, notes, terms
  } = req.body;
  const now = new Date().toISOString();
  db.prepare(`UPDATE proposals SET
    lead_id=?,property_id=?,title=?,status=?,client_name=?,client_company=?,client_phone=?,client_email=?,
    event_date=?,event_type=?,venue=?,pax=?,validity_date=?,payment_terms=?,cancellation_policy=?,
    tax_percent=?,discount=?,total_value=?,line_items=?,notes=?,terms=?,updated_at=?
    WHERE id=?`).run(
    lead_id??p.lead_id, property_id??p.property_id, title??p.title, status??p.status,
    client_name??p.client_name, client_company??p.client_company, client_phone??p.client_phone, client_email??p.client_email,
    event_date??p.event_date, event_type??p.event_type, venue??p.venue, pax??p.pax,
    validity_date??p.validity_date, payment_terms??p.payment_terms, cancellation_policy??p.cancellation_policy,
    tax_percent??p.tax_percent, discount??p.discount,
    total_value??p.total_value,
    line_items !== undefined ? JSON.stringify(line_items) : p.line_items,
    notes??p.notes, terms??p.terms, now, req.params.id
  );
  return res.json(db.prepare('SELECT * FROM proposals WHERE id=?').get(req.params.id));
});

// Upload photos to a proposal
router.post('/:id/photos', (req: AuthRequest, res: Response) => {
  const p = db.prepare('SELECT * FROM proposals WHERE id=?').get(req.params.id) as any;
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (req.user!.role === 'executive' && p.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });

  const uploader = makePhotoUpload(req.params.id);
  uploader.array('photos', 10)(req as any, res as any, (err: any) => {
    if (err) return res.status(400).json({ error: err.message });
    const files = (req as any).files as Express.Multer.File[];
    let existing: string[] = [];
    try { existing = JSON.parse(p.photos || '[]'); } catch {}
    const newPaths = files.map(f => `/uploads/proposals/${req.params.id}/${f.filename}`);
    const all = [...existing, ...newPaths];
    db.prepare('UPDATE proposals SET photos=?, updated_at=? WHERE id=?').run(JSON.stringify(all), new Date().toISOString(), req.params.id);
    return res.json({ photos: all });
  });
});

router.delete('/:id/photos', (req: AuthRequest, res: Response) => {
  const p = db.prepare('SELECT * FROM proposals WHERE id=?').get(req.params.id) as any;
  if (!p) return res.status(404).json({ error: 'Not found' });
  const { photo_path } = req.body;
  let existing: string[] = [];
  try { existing = JSON.parse(p.photos || '[]'); } catch {}
  const updated = existing.filter(ph => ph !== photo_path);
  db.prepare('UPDATE proposals SET photos=?, updated_at=? WHERE id=?').run(JSON.stringify(updated), new Date().toISOString(), req.params.id);
  return res.json({ photos: updated });
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const p = db.prepare('SELECT * FROM proposals WHERE id=?').get(req.params.id) as any;
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (req.user!.role === 'executive' && p.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM proposals WHERE id=?').run(req.params.id);
  return res.json({ success: true });
});

export default router;
