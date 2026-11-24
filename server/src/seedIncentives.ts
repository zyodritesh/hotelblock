import { v4 as uuidv4 } from 'uuid';
import { METRICS } from './incentiveMetrics';

const WEIGHTS: Record<string, number> = {
  corporate_closures: 15,
  wedding_closures: 15,
  wedding_revenue: 15,
  fit_revenue: 10,
  event_revenue: 15,
  banquet_revenue: 10,
  rooms_revenue: 10,
  corporate_revenue: 10,
};

const INDIVIDUAL_TARGETS: Record<string, number> = {
  corporate_closures: 2,
  wedding_closures: 1,
  wedding_revenue: 500000,
  fit_revenue: 200000,
  event_revenue: 800000,
  banquet_revenue: 600000,
  rooms_revenue: 400000,
  corporate_revenue: 400000,
};

const RULES = [
  { scope: 'individual', metric: 'corporate_closures', name: 'Corporate closure payout', calc: 'per_unit', rate: 2500 },
  { scope: 'individual', metric: 'wedding_closures', name: 'Wedding closure payout', calc: 'per_unit', rate: 5000 },
  { scope: 'individual', metric: 'wedding_revenue', name: 'Wedding revenue share', calc: 'percent', rate: 1 },
  { scope: 'individual', metric: 'fit_revenue', name: 'FIT revenue share', calc: 'percent', rate: 0.75 },
  { scope: 'individual', metric: 'event_revenue', name: 'Event revenue share', calc: 'percent', rate: 1 },
  { scope: 'individual', metric: 'banquet_revenue', name: 'Banquet revenue share', calc: 'percent', rate: 1 },
  { scope: 'individual', metric: 'rooms_revenue', name: 'Rooms revenue share', calc: 'percent', rate: 0.5 },
  { scope: 'team', metric: 'event_revenue', name: 'Team event pool', calc: 'percent', rate: 0.25 },
  { scope: 'team', metric: 'wedding_closures', name: 'Team wedding bonus', calc: 'per_unit', rate: 2000 },
  { scope: 'team', metric: 'corporate_closures', name: 'Team corporate bonus', calc: 'on_target', rate: 15000 },
];

function monthStamp(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function seedIncentives(db: any) {
  const ruleCount = (db.prepare('SELECT COUNT(*) as c FROM incentive_rules').get() as any).c;
  if (ruleCount === 0) {
    const insert = db.prepare('INSERT INTO incentive_rules (id,scope,metric,name,calc,rate,active,created_at) VALUES (?,?,?,?,?,?,1,?)');
    const now = new Date().toISOString();
    for (const r of RULES) insert.run(uuidv4(), r.scope, r.metric, r.name, r.calc, r.rate, now);
  }

  const targetCount = (db.prepare('SELECT COUNT(*) as c FROM score_targets').get() as any).c;
  if (targetCount === 0) {
    const people = db.prepare("SELECT id FROM users WHERE active=1 AND role IN ('executive','manager')").all() as { id: string }[];
    const admin = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
    const maker = admin?.id || people[0]?.id;
    const insert = db.prepare('INSERT INTO score_targets (id,scope,user_id,month,metric,target_value,weight,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
    const now = new Date().toISOString();
    const months = [monthStamp(0), monthStamp(-1)];
    for (const month of months) {
      for (const p of people) {
        for (const m of METRICS) {
          insert.run(uuidv4(), 'individual', p.id, month, m.key, INDIVIDUAL_TARGETS[m.key] || 0, WEIGHTS[m.key] || 10, maker || null, now);
        }
      }
      for (const m of METRICS) {
        const base = INDIVIDUAL_TARGETS[m.key] || 0;
        insert.run(uuidv4(), 'team', null, month, m.key, base * Math.max(people.length, 1), WEIGHTS[m.key] || 10, maker || null, now);
      }
    }
  }

  const incentiveCount = (db.prepare('SELECT COUNT(*) as c FROM incentives').get() as any).c;
  if (incentiveCount > 0) return;

  const byEmail = (email: string) => db.prepare('SELECT id, name FROM users WHERE email=?').get(email) as { id: string; name: string } | undefined;
  const admin = byEmail('admin@hotel.com');
  const rahul = byEmail('rahul@hotel.com');
  const priya = byEmail('priya@hotel.com');
  const vivek = byEmail('vivek@gmail.com');
  if (!admin || !rahul || !priya) return;

  const thisMonth = monthStamp(0);
  const lastMonth = monthStamp(-1);
  const insertInc = db.prepare(`INSERT INTO incentives (id,scope,user_id,month,title,metric,amount,status,maker_id,approved_by,approved_at,paid_by,paid_at,note,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertEvent = db.prepare('INSERT INTO incentive_events (id,incentive_id,action,actor_id,amount,note,created_at) VALUES (?,?,?,?,?,?,?)');

  const samples: any[] = [
    { scope: 'individual', user_id: priya.id, month: lastMonth, title: 'Wedding closure incentive', metric: 'wedding_closures', amount: 15000, status: 'paid', maker: rahul.id, approver: admin.id, payer: admin.id, note: 'Two wedding closures booked and billed.' },
    { scope: 'individual', user_id: priya.id, month: thisMonth, title: 'Corporate closures — this month', metric: 'corporate_closures', amount: 5000, status: 'added', maker: admin.id, note: '₹2,500 × corporate closures, waiting for approval.' },
    { scope: 'individual', user_id: vivek?.id || priya.id, month: lastMonth, title: 'FIT revenue share', metric: 'fit_revenue', amount: 7500, status: 'approved', maker: rahul.id, approver: admin.id, note: '0.75% of FIT room revenue.' },
    { scope: 'individual', user_id: rahul.id, month: thisMonth, title: 'Event revenue share', metric: 'event_revenue', amount: 12000, status: 'approved', maker: admin.id, approver: rahul.id, note: '1% of event revenue closed this month.' },
    { scope: 'individual', user_id: vivek?.id || priya.id, month: thisMonth, title: 'Rooms revenue share', metric: 'rooms_revenue', amount: 4000, status: 'added', maker: rahul.id, note: '0.5% of rooms revenue. Not approved yet.' },
    { scope: 'team', user_id: null, month: lastMonth, title: 'Team banquet pool', metric: 'banquet_revenue', amount: 25000, status: 'paid', maker: admin.id, approver: admin.id, payer: admin.id, note: 'Shared team incentive on banquet revenue.' },
    { scope: 'team', user_id: null, month: thisMonth, title: 'Team wedding push', metric: 'wedding_closures', amount: 10000, status: 'added', maker: rahul.id, note: 'Team pool for weddings closed this month.' },
  ];

  samples.forEach((s, i) => {
    const id = uuidv4();
    const created = new Date(Date.now() - (samples.length - i) * 86400000).toISOString();
    const approvedAt = s.status === 'added' ? null : new Date(Date.parse(created) + 3600000).toISOString();
    const paidAt = s.status === 'paid' ? new Date(Date.parse(created) + 7200000).toISOString() : null;
    insertInc.run(
      id, s.scope, s.user_id, s.month, s.title, s.metric, s.amount, s.status, s.maker,
      s.approver || null, approvedAt, s.payer || null, paidAt, s.note, created, paidAt || approvedAt || created
    );
    insertEvent.run(uuidv4(), id, 'added', s.maker, s.amount, s.note, created);
    if (s.status === 'approved' || s.status === 'paid') {
      insertEvent.run(uuidv4(), id, 'approved', s.approver || s.maker, s.amount, 'Approved for the wallet', approvedAt);
    }
    if (s.status === 'paid') {
      insertEvent.run(uuidv4(), id, 'paid', s.payer || s.maker, s.amount, 'Marked paid', paidAt);
    }
  });
}
