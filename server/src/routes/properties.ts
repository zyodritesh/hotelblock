import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../db';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const uploadDir = path.join(__dirname, '../../../uploads/logos');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();
router.use(authenticate);

router.get('/', (_req: AuthRequest, res: Response) => {
  return res.json(db.prepare('SELECT * FROM properties WHERE active=1 ORDER BY name').all());
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  const p = db.prepare('SELECT * FROM properties WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  return res.json(p);
});

router.post('/', requireAdmin, upload.single('logo'), (req: AuthRequest, res: Response) => {
  const { name, address, city, phone, email, website, gst_number, brand_color } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  const logo_path = req.file ? `/uploads/logos/${req.file.filename}` : null;
  db.prepare('INSERT INTO properties (id,name,address,city,phone,email,website,gst_number,logo_path,brand_color) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    id, name, address||'', city||'', phone||'', email||'', website||'', gst_number||'', logo_path, brand_color||'#2563eb'
  );
  return res.status(201).json(db.prepare('SELECT * FROM properties WHERE id=?').get(id));
});

router.put('/:id', requireAdmin, upload.single('logo'), (req: AuthRequest, res: Response) => {
  const p = db.prepare('SELECT * FROM properties WHERE id=?').get(req.params.id) as any;
  if (!p) return res.status(404).json({ error: 'Not found' });
  const { name, address, city, phone, email, website, gst_number, brand_color } = req.body;
  const logo_path = req.file ? `/uploads/logos/${req.file.filename}` : p.logo_path;
  db.prepare('UPDATE properties SET name=?,address=?,city=?,phone=?,email=?,website=?,gst_number=?,logo_path=?,brand_color=? WHERE id=?').run(
    name??p.name, address??p.address, city??p.city, phone??p.phone, email??p.email, website??p.website,
    gst_number??p.gst_number, logo_path, brand_color??p.brand_color, req.params.id
  );
  return res.json(db.prepare('SELECT * FROM properties WHERE id=?').get(req.params.id));
});

router.delete('/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  db.prepare('UPDATE properties SET active=0 WHERE id=?').run(req.params.id);
  return res.json({ success: true });
});

export default router;
