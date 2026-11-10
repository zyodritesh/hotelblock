import { Router, Response } from 'express';
import db from '../db';
import { authenticate, ownScope, AuthRequest } from '../middleware/auth';
import { isOnline } from '../live';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const me = req.user!.id;
  const q = String(req.query.q || '').trim().toLowerCase();
  const own = ownScope(req.user!.role);
  const team = (db.prepare("SELECT id, name, role FROM users WHERE active=1 AND role != 'agent' AND id!=? ORDER BY name").all(me) as { id: string; name: string; role: string }[])
    .map(u => ({ ...u, online: isOnline(u.id) }));

  let contactSql = `SELECT c.id, c.name, c.phone, IFNULL(a.name, '') as company
    FROM contacts c LEFT JOIN accounts a ON a.id = c.account_id
    WHERE c.phone IS NOT NULL AND trim(c.phone) != ''`;
  const contactParams: any[] = [];
  if (q) {
    contactSql += ` AND (lower(c.name) LIKE ? OR c.phone LIKE ? OR lower(IFNULL(a.name, '')) LIKE ?)`;
    const s = `%${q}%`;
    contactParams.push(s, s, s);
  }
  contactSql += ' ORDER BY c.name LIMIT 40';
  const contacts = db.prepare(contactSql).all(...contactParams);

  let recentSql = `SELECT phone, contact_name as name, IFNULL(company, '') as company, MAX(created_at) as last_at
    FROM calls WHERE phone IS NOT NULL AND trim(phone) != ''`;
  const recentParams: any[] = [];
  if (own) { recentSql += ' AND user_id = ?'; recentParams.push(me); }
  if (q) {
    recentSql += ` AND (lower(contact_name) LIKE ? OR phone LIKE ? OR lower(IFNULL(company, '')) LIKE ?)`;
    const s = `%${q}%`;
    recentParams.push(s, s, s);
  }
  recentSql += ' GROUP BY phone ORDER BY last_at DESC LIMIT 20';
  const recent = db.prepare(recentSql).all(...recentParams);

  return res.json({ team, contacts, recent });
});

export default router;
