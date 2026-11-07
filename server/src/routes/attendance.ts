import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const { user_id, month } = req.query as Record<string, string>;
  let q = `SELECT a.*, u.name as user_name FROM attendance a LEFT JOIN users u ON a.user_id=u.id WHERE 1=1`;
  const params: any[] = [];
  if (req.user!.role === 'executive') { q += ' AND a.user_id = ?'; params.push(req.user!.id); }
  else if (user_id) { q += ' AND a.user_id = ?'; params.push(user_id); }
  if (month) { q += ' AND a.date LIKE ?'; params.push(`${month}%`); }
  q += ' ORDER BY a.date DESC';
  return res.json(db.prepare(q).all(...params));
});

router.post('/checkin', (req: AuthRequest, res: Response) => {
  const { lat, lng } = req.body;
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare('SELECT * FROM attendance WHERE user_id=? AND date=?').get(req.user!.id, today) as any;
  if (existing?.check_in_at) return res.status(409).json({ error: 'Already checked in today' });

  const gf = db.prepare('SELECT * FROM geofence WHERE id=1').get() as any;
  if (gf && gf.lat !== 0 && gf.lng !== 0 && lat !== undefined && lng !== undefined) {
    const dist = haversineDistance(parseFloat(lat), parseFloat(lng), gf.lat, gf.lng);
    if (dist > gf.radius_meters) {
      return res.status(403).json({ error: `You are ${Math.round(dist)}m away from hotel. Must be within ${gf.radius_meters}m to check in.`, distance: Math.round(dist), allowed: gf.radius_meters });
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  let isLate = 0;
  if (gf?.checkin_cutoff) {
    const [h, m] = gf.checkin_cutoff.split(':').map(Number);
    const cutoff = new Date(); cutoff.setHours(h, m, 0, 0);
    isLate = now > cutoff ? 1 : 0;
  }

  if (existing) {
    db.prepare('UPDATE attendance SET check_in_at=?,check_in_lat=?,check_in_lng=?,is_late=?,status=? WHERE id=?').run(nowIso, lat||null, lng||null, isLate, 'present', existing.id);
    return res.json(db.prepare('SELECT * FROM attendance WHERE id=?').get(existing.id));
  } else {
    const id = uuidv4();
    db.prepare('INSERT INTO attendance (id,user_id,date,check_in_at,check_in_lat,check_in_lng,is_late,status) VALUES (?,?,?,?,?,?,?,?)').run(id, req.user!.id, today, nowIso, lat||null, lng||null, isLate, 'present');
    return res.status(201).json(db.prepare('SELECT * FROM attendance WHERE id=?').get(id));
  }
});

router.post('/checkout', (req: AuthRequest, res: Response) => {
  const { lat, lng } = req.body;
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare('SELECT * FROM attendance WHERE user_id=? AND date=?').get(req.user!.id, today) as any;
  if (!existing?.check_in_at) return res.status(400).json({ error: 'Must check in first' });
  if (existing.check_out_at) return res.status(409).json({ error: 'Already checked out today' });

  const gf = db.prepare('SELECT * FROM geofence WHERE id=1').get() as any;
  if (gf && gf.lat !== 0 && gf.lng !== 0 && lat !== undefined && lng !== undefined) {
    const dist = haversineDistance(parseFloat(lat), parseFloat(lng), gf.lat, gf.lng);
    if (dist > gf.radius_meters) {
      return res.status(403).json({ error: `You are ${Math.round(dist)}m away from hotel. Must be within ${gf.radius_meters}m to check out.`, distance: Math.round(dist), allowed: gf.radius_meters });
    }
  }

  db.prepare('UPDATE attendance SET check_out_at=?,check_out_lat=?,check_out_lng=? WHERE id=?').run(new Date().toISOString(), lat||null, lng||null, existing.id);
  return res.json(db.prepare('SELECT * FROM attendance WHERE id=?').get(existing.id));
});

router.get('/today', (req: AuthRequest, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const row = db.prepare('SELECT * FROM attendance WHERE user_id=? AND date=?').get(req.user!.id, today);
  return res.json(row || null);
});

router.get('/geofence', (_req: AuthRequest, res: Response) => {
  return res.json(db.prepare('SELECT * FROM geofence WHERE id=1').get() || {});
});

router.put('/geofence', requireAdmin, (req: AuthRequest, res: Response) => {
  const { name, lat, lng, radius_meters, checkin_cutoff } = req.body;
  const gf = db.prepare('SELECT * FROM geofence WHERE id=1').get() as any;
  db.prepare('UPDATE geofence SET name=?,lat=?,lng=?,radius_meters=?,checkin_cutoff=?,updated_at=? WHERE id=1').run(
    name??gf.name, lat??gf.lat, lng??gf.lng, radius_meters??gf.radius_meters, checkin_cutoff??gf.checkin_cutoff, new Date().toISOString()
  );
  return res.json(db.prepare('SELECT * FROM geofence WHERE id=1').get());
});

export default router;
