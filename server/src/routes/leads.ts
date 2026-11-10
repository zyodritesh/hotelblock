import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, ownScope, AuthRequest } from '../middleware/auth';
import { notifyUsers } from '../notify';

const router = Router();
router.use(authenticate);

const LIST_FROM = `
  FROM leads l
  LEFT JOIN users u ON l.user_id = u.id
  LEFT JOIN users creator ON l.created_by = creator.id
  LEFT JOIN accounts a ON l.account_id = a.id
  LEFT JOIN contacts c ON l.contact_id = c.id
  LEFT JOIN properties pr ON l.property_id = pr.id
`;

const LIST_SELECT = `
  SELECT l.*, u.name as user_name, creator.name as created_by_name, a.name as account_name, c.name as contact_name,
    pr.name as property_name, pr.city as property_city,
    (
      SELECT json_group_array(json_object('id', ou.id, 'name', ou.name, 'role', ou.role))
      FROM lead_owners lo
      JOIN users ou ON ou.id = lo.user_id
      WHERE lo.lead_id = l.id
    ) as owners_json
`;

function present(row: any) {
  if (!row) return row;
  let owners: { id: string; name: string; role: string }[] = [];
  try { owners = row.owners_json ? JSON.parse(row.owners_json) : []; } catch { owners = []; }
  owners.sort((a, b) => (a.id === row.user_id ? 0 : 1) - (b.id === row.user_id ? 0 : 1));
  const { owners_json, ...rest } = row;
  return { ...rest, owners };
}

function canAccess(user: { id: string; role: string }, lead: any) {
  if (!ownScope(user.role)) return true;
  if (lead.user_id === user.id || lead.created_by === user.id) return true;
  return !!db.prepare('SELECT 1 as ok FROM lead_owners WHERE lead_id=? AND user_id=?').get(lead.id, user.id);
}

function resolveOwners(ownerIds: unknown, fallback: string): { ids: string[]; primary: string } | { error: string } {
  const raw = Array.isArray(ownerIds) ? ownerIds.map(String) : [fallback];
  const ids = [...new Set(raw.map(s => s.trim()).filter(Boolean))];
  if (!ids.length) return { error: 'Choose at least one lead owner' };
  const found = db.prepare(
    `SELECT id FROM users WHERE active=1 AND id IN (${ids.map(() => '?').join(',')})`,
  ).all(...ids) as { id: string }[];
  if (found.length !== ids.length) return { error: 'Each owner must be an active person in this company' };
  return { ids, primary: ids[0] };
}

function saveOwners(leadId: string, ids: string[], primary: string, addedBy: string) {
  const prev = new Set(
    (db.prepare('SELECT user_id FROM lead_owners WHERE lead_id=?').all(leadId) as { user_id: string }[]).map(r => r.user_id),
  );
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM lead_owners WHERE lead_id=?').run(leadId);
    const ins = db.prepare('INSERT INTO lead_owners (lead_id, user_id, added_by) VALUES (?,?,?)');
    for (const id of ids) ins.run(leadId, id, addedBy);
    db.prepare('UPDATE leads SET user_id=? WHERE id=?').run(primary, leadId);
  });
  tx();
  return ids.filter(id => !prev.has(id));
}

function leadById(id: string) {
  return present(db.prepare(`${LIST_SELECT} ${LIST_FROM} WHERE l.id=?`).get(id));
}

function resolveProperty(propertyId: unknown): { id: string } | { error: string } {
  const id = String(propertyId || '').trim();
  if (!id) return { error: 'Choose a hotel' };
  const row = db.prepare('SELECT id FROM properties WHERE id=? AND active=1').get(id) as { id: string } | undefined;
  if (!row) return { error: 'Choose a hotel' };
  return { id: row.id };
}

function tellOwners(added: string[], actor: { id: string; name: string }, lead: { id: string; title: string; segment: string }) {
  notifyUsers(added, actor.id, {
    type: 'lead_assigned',
    title: 'New lead assigned to you',
    body: `${actor.name} assigned you “${lead.title}” (${lead.segment}).`,
    leadId: lead.id,
  });
}

router.get('/', (req: AuthRequest, res: Response) => {
  const { user_id, segment, stage, search, property_id, limit = '200', offset = '0' } = req.query as Record<string, string>;
  let base = `${LIST_FROM} WHERE 1=1`;
  const params: any[] = [];
  if (ownScope(req.user!.role)) {
    base += ' AND (l.user_id = ? OR l.created_by = ? OR EXISTS (SELECT 1 FROM lead_owners lo WHERE lo.lead_id = l.id AND lo.user_id = ?))';
    params.push(req.user!.id, req.user!.id, req.user!.id);
  }
  if (user_id) {
    base += ' AND (l.user_id = ? OR EXISTS (SELECT 1 FROM lead_owners lo WHERE lo.lead_id = l.id AND lo.user_id = ?))';
    params.push(user_id, user_id);
  }
  if (property_id) { base += ' AND l.property_id = ?'; params.push(property_id); }
  if (segment) { base += ' AND l.segment = ?'; params.push(segment); }
  if (stage) { base += ' AND l.stage = ?'; params.push(stage); }
  if (search) {
    base += ' AND (l.title LIKE ? OR a.name LIKE ? OR c.name LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  const total = (db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params) as any).c;
  const rows = db.prepare(`${LIST_SELECT} ${base} ORDER BY l.updated_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), parseInt(offset));
  return res.json({ data: rows.map(present), total });
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id) as any;
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (!canAccess(req.user!, lead)) return res.status(403).json({ error: 'Forbidden' });
  return res.json(leadById(lead.id));
});

router.post('/', (req: AuthRequest, res: Response) => {
  const { account_id, contact_id, title, segment, stage, estimated_revenue, event_date, room_nights, pax, notes, owner_ids, property_id } = req.body;
  if (!title || !segment) return res.status(400).json({ error: 'title, segment required' });
  const resolved = resolveOwners(owner_ids, req.user!.id);
  if ('error' in resolved) return res.status(400).json({ error: resolved.error });
  const hotel = resolveProperty(property_id);
  if ('error' in hotel) return res.status(400).json({ error: hotel.error });
  const id = uuidv4();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO leads (id,account_id,contact_id,user_id,property_id,title,segment,stage,estimated_revenue,event_date,room_nights,pax,notes,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, account_id || null, contact_id || null, resolved.primary, hotel.id, title, segment,
      stage || 'Prospect', estimated_revenue || 0, event_date || null, room_nights || 0, pax || 0, notes || '',
      req.user!.id, now, now,
    );
    const ins = db.prepare('INSERT INTO lead_owners (lead_id, user_id, added_by) VALUES (?,?,?)');
    for (const ownerId of resolved.ids) ins.run(id, ownerId, req.user!.id);
  });
  tx();
  tellOwners(resolved.ids, req.user!, { id, title, segment });
  return res.status(201).json(leadById(id));
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id) as any;
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (!canAccess(req.user!, lead)) return res.status(403).json({ error: 'Forbidden' });
  const { account_id, contact_id, title, segment, stage, estimated_revenue, event_date, room_nights, pax, notes, owner_ids, property_id } = req.body;
  let resolvedOwners: { ids: string[]; primary: string } | null = null;
  if (Array.isArray(owner_ids)) {
    const resolved = resolveOwners(owner_ids, lead.user_id);
    if ('error' in resolved) return res.status(400).json({ error: resolved.error });
    resolvedOwners = resolved;
  }
  let propertyId = lead.property_id;
  if (property_id !== undefined) {
    const hotel = resolveProperty(property_id);
    if ('error' in hotel) return res.status(400).json({ error: hotel.error });
    propertyId = hotel.id;
  }
  const now = new Date().toISOString();
  db.prepare(`UPDATE leads SET account_id=?,contact_id=?,property_id=?,title=?,segment=?,stage=?,estimated_revenue=?,event_date=?,room_nights=?,pax=?,notes=?,updated_at=? WHERE id=?`).run(
    account_id ?? lead.account_id, contact_id ?? lead.contact_id, propertyId, title ?? lead.title, segment ?? lead.segment,
    stage ?? lead.stage, estimated_revenue ?? lead.estimated_revenue, event_date ?? lead.event_date,
    room_nights ?? lead.room_nights, pax ?? lead.pax, notes ?? lead.notes, now, req.params.id,
  );
  const added = resolvedOwners ? saveOwners(lead.id, resolvedOwners.ids, resolvedOwners.primary, req.user!.id) : [];
  const saved = leadById(lead.id);
  if (added.length) tellOwners(added, req.user!, saved);
  return res.json(saved);
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id) as any;
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (!canAccess(req.user!, lead)) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM leads WHERE id=?').run(req.params.id);
  return res.json({ success: true });
});

export default router;
