import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, AuthRequest, requireAdmin, requireManagerOrAdmin } from '../middleware/auth';
import { notifyUsers } from '../notify';
import {
  INCENTIVE_METRICS, incentiveProgress, loyaltyTiers, readIncentive, saveLoyalty, settleIncentives, walletView,
} from '../agentClub';

const router = Router();
router.use(authenticate);

const SEGMENTS = ['Rooms', 'Corporate', 'Events', 'Banquets'];

function agentFor(userId: string) {
  return db.prepare('SELECT * FROM agents WHERE user_id=?').get(userId) as any;
}

function requireAgent(req: AuthRequest, res: Response) {
  if (req.user?.role !== 'agent') {
    res.status(403).json({ error: 'Agent login required' });
    return null;
  }
  const agent = agentFor(req.user.id);
  if (!agent) {
    res.status(403).json({ error: 'Agent profile missing' });
    return null;
  }
  return agent;
}

function portalPayload(agent: any) {
  const hotels = db.prepare('SELECT id, name, city FROM properties WHERE active=1 ORDER BY name').all();
  const enquiries = db.prepare(`SELECT l.id, l.title, l.segment, l.stage, l.event_date, l.event_end_date, l.pax, l.estimated_revenue, l.created_at,
      pr.name as property_name, pr.city as property_city
    FROM leads l LEFT JOIN properties pr ON pr.id=l.property_id
    WHERE l.agent_id=? ORDER BY l.created_at DESC LIMIT 50`).all(agent.id);
  const ledger = db.prepare('SELECT id, amount, reason, note, created_at FROM agent_wallet WHERE agent_id=? ORDER BY created_at DESC LIMIT 30').all(agent.id);
  const vouchers = db.prepare(`SELECT v.id, v.code, v.nights, v.points_spent as rupees, v.guest_name, v.event_date, v.event_end_date, v.status, v.created_at,
      pr.name as property_name, pr.city as property_city
    FROM agent_vouchers v LEFT JOIN properties pr ON pr.id=v.property_id
    WHERE v.agent_id=? ORDER BY v.created_at DESC LIMIT 20`).all(agent.id);
  const owner = agent.assigned_to
    ? db.prepare('SELECT name FROM users WHERE id=?').get(agent.assigned_to) as { name: string } | undefined
    : undefined;
  return {
    agent: {
      id: agent.id, name: agent.name, agency_name: agent.agency_name, city: agent.city, phone: agent.phone,
      owner_name: owner?.name || null,
      commission_type: agent.commission_type || 'percent',
      commission_rate: Number(agent.commission_rate) || 0,
    },
    wallet: walletView(agent.id),
    incentives: incentiveProgress(agent.id),
    metrics: INCENTIVE_METRICS,
    tiers: loyaltyTiers(),
    hotels, enquiries, ledger, vouchers,
  };
}

router.get('/me', (req: AuthRequest, res: Response) => {
  const agent = requireAgent(req, res);
  if (!agent) return;
  return res.json(portalPayload(agent));
});

router.get('/loyalty', (req: AuthRequest, res: Response) => {
  if (req.user?.role === 'agent') return res.status(403).json({ error: 'Forbidden' });
  return res.json({ tiers: loyaltyTiers(), metrics: INCENTIVE_METRICS });
});

router.put('/loyalty', requireAdmin, (req: AuthRequest, res: Response) => {
  const saved = saveLoyalty(Array.isArray(req.body?.tiers) ? req.body.tiers : []);
  if ('error' in saved) return res.status(400).json(saved);
  return res.json(saved);
});

router.get('/agents/:agentId/pay', (req: AuthRequest, res: Response) => {
  if (req.user?.role === 'agent') return res.status(403).json({ error: 'Forbidden' });
  const agent = db.prepare('SELECT id, name, commission_type, commission_rate, assigned_to FROM agents WHERE id=?').get(req.params.agentId) as any;
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  return res.json({
    commission_type: agent.commission_type || 'percent',
    commission_rate: Number(agent.commission_rate) || 0,
    wallet: walletView(agent.id),
    incentives: incentiveProgress(agent.id),
    metrics: INCENTIVE_METRICS,
  });
});

router.post('/agents/:agentId/incentives', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const agent = db.prepare('SELECT id FROM agents WHERE id=?').get(req.params.agentId) as { id: string } | undefined;
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const parsed = readIncentive(req.body || {});
  if ('error' in parsed) return res.status(400).json(parsed);
  const id = uuidv4();
  db.prepare(`INSERT INTO agent_incentives (id, agent_id, task, metric, target_value, pay_type, rate, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, agent.id, parsed.task, parsed.metric, parsed.target_value, parsed.pay_type, parsed.rate, req.user!.id, new Date().toISOString());
  const posted = settleIncentives(agent.id);
  return res.status(201).json({ id, posted, incentives: incentiveProgress(agent.id), wallet: walletView(agent.id) });
});

router.delete('/agents/:agentId/incentives/:incentiveId', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  db.prepare('DELETE FROM agent_incentives WHERE id=? AND agent_id=?').run(req.params.incentiveId, req.params.agentId);
  return res.json({ ok: true, incentives: incentiveProgress(req.params.agentId) });
});

router.post('/enquiries', (req: AuthRequest, res: Response) => {
  const agent = requireAgent(req, res);
  if (!agent) return;
  const guest = String(req.body.guest_name || '').trim();
  const phone = String(req.body.guest_phone || '').trim();
  const segment = String(req.body.segment || '');
  const propertyId = String(req.body.property_id || '');
  const start = String(req.body.event_date || '').slice(0, 10);
  const end = String(req.body.event_end_date || start).slice(0, 10);
  const pax = Math.max(0, Number(req.body.pax) || 0);
  const notes = String(req.body.notes || '').trim();
  if (!guest) return res.status(400).json({ error: 'Guest name is required' });
  if (!SEGMENTS.includes(segment)) return res.status(400).json({ error: 'Choose rooms, corporate, events, or banquets' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return res.status(400).json({ error: 'Choose a date' });
  if (end < start) return res.status(400).json({ error: 'End date must be on or after the start date' });
  const hotel = db.prepare('SELECT id, name FROM properties WHERE id=? AND active=1').get(propertyId) as { id: string; name: string } | undefined;
  if (!hotel) return res.status(400).json({ error: 'Choose a hotel' });
  const ownerId = agent.assigned_to
    || (db.prepare(`SELECT id FROM users WHERE active=1 AND role IN ('executive','manager','admin') ORDER BY role LIMIT 1`).get() as { id: string } | undefined)?.id;
  if (!ownerId) return res.status(400).json({ error: 'No salesperson is available yet' });
  const id = uuidv4();
  const now = new Date().toISOString();
  const title = `${agent.agency_name || agent.name} · ${guest}`;
  const fullNotes = [`From agent ${agent.name}${agent.agency_name ? ` (${agent.agency_name})` : ''}.`, phone ? `Guest phone: ${phone}` : '', notes].filter(Boolean).join('\n');
  db.prepare(`INSERT INTO leads (id, user_id, property_id, agent_id, title, segment, stage, estimated_revenue, event_date, event_end_date, pax, notes, created_by, created_at, updated_at)
    VALUES (?,?,?,?,?,?, 'Prospect', 0, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, ownerId, hotel.id, agent.id, title, segment, start, end, pax, fullNotes, req.user!.id, now, now,
  );
  db.prepare('INSERT INTO lead_owners (lead_id, user_id, added_by) VALUES (?,?,?)').run(id, ownerId, req.user!.id);
  const posted = settleIncentives(agent.id);
  notifyUsers([ownerId], req.user!.id, {
    type: 'lead_assigned',
    title: 'New agent enquiry',
    body: `${agent.name} sent “${guest}” for ${hotel.name}.`,
    leadId: id,
  });
  return res.status(201).json({ id, posted, wallet: walletView(agent.id) });
});

router.post('/redeem', (req: AuthRequest, res: Response) => {
  const agent = requireAgent(req, res);
  if (!agent) return;
  const nights = Number(req.body.nights) || 1;
  const guest = String(req.body.guest_name || '').trim();
  const propertyId = String(req.body.property_id || '');
  const start = String(req.body.event_date || '').slice(0, 10);
  const end = String(req.body.event_end_date || start).slice(0, 10);
  if (![1, 2].includes(nights)) return res.status(400).json({ error: 'Choose 1 or 2 free nights' });
  if (!guest) return res.status(400).json({ error: 'Guest name is required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || end < start) return res.status(400).json({ error: 'Choose the stay dates' });
  const hotel = db.prepare('SELECT id, name FROM properties WHERE id=? AND active=1').get(propertyId) as { id: string; name: string } | undefined;
  if (!hotel) return res.status(400).json({ error: 'Choose a hotel' });
  const view = walletView(agent.id);
  const cost = nights * view.nightPrice;
  if (view.balance < cost) return res.status(400).json({ error: `You need ₹${(cost - view.balance).toLocaleString('en-IN')} more in your wallet` });
  const code = `FN-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const id = uuidv4();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO agent_vouchers (id, agent_id, code, nights, points_spent, property_id, guest_name, event_date, event_end_date, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,'issued',?)`).run(id, agent.id, code, nights, cost, hotel.id, guest, start, end, now);
    db.prepare(`INSERT INTO agent_wallet (id, agent_id, amount, reason, note, created_at) VALUES (?,?,?,?,?,?)`).run(
      uuidv4(), agent.id, -cost, 'free night', code, now,
    );
  });
  tx();
  if (agent.assigned_to) {
    notifyUsers([agent.assigned_to], req.user!.id, {
      type: 'lead_assigned',
      title: 'Agent used a free night',
      body: `${agent.name} issued ${code} for ${guest} at ${hotel.name}.`,
    });
  }
  return res.status(201).json({ code, nights, rupees: cost, wallet: walletView(agent.id) });
});

router.get('/vouchers', (req: AuthRequest, res: Response) => {
  if (req.user?.role === 'agent') return res.status(403).json({ error: 'Forbidden' });
  const own = req.user?.role === 'executive' || req.user?.role === 'call_center';
  const rows = db.prepare(`SELECT v.*, v.points_spent as rupees, a.name as agent_name, a.agency_name, pr.name as property_name
    FROM agent_vouchers v
    JOIN agents a ON a.id=v.agent_id
    LEFT JOIN properties pr ON pr.id=v.property_id
    ${own ? 'WHERE a.assigned_to=?' : ''}
    ORDER BY v.created_at DESC LIMIT 100`).all(...(own ? [req.user!.id] : []));
  return res.json(rows);
});

router.post('/vouchers/:id/use', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT id, status FROM agent_vouchers WHERE id=?').get(req.params.id) as { id: string; status: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Voucher not found' });
  db.prepare(`UPDATE agent_vouchers SET status='used' WHERE id=?`).run(row.id);
  return res.json({ ok: true });
});

export default router;
