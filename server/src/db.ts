import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { seedIncentives } from './seedIncentives';
import { seedSalesTeam } from './salesTeam';

const DB_PATH = path.join(__dirname, '../../data/hotelblock.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'executive',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      gst_number TEXT,
      logo_path TEXT,
      brand_color TEXT NOT NULL DEFAULT '#2563eb',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Corporate',
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      name TEXT NOT NULL,
      title TEXT,
      phone TEXT,
      email TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      contact_id TEXT,
      contact_name TEXT,
      company TEXT,
      phone TEXT,
      user_id TEXT NOT NULL,
      property_id TEXT,
      segment TEXT NOT NULL,
      call_type TEXT NOT NULL,
      duration_min INTEGER DEFAULT 0,
      outcome TEXT NOT NULL,
      notes TEXT,
      next_action TEXT,
      next_action_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      contact_id TEXT,
      contact_name TEXT,
      company TEXT,
      user_id TEXT NOT NULL,
      property_id TEXT,
      segment TEXT NOT NULL,
      purpose TEXT,
      outcome TEXT,
      notes TEXT,
      photo_path TEXT,
      lat REAL,
      lng REAL,
      address_label TEXT,
      meeting_date TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      contact_id TEXT,
      user_id TEXT NOT NULL,
      property_id TEXT,
      title TEXT NOT NULL,
      segment TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'Prospect',
      estimated_revenue REAL DEFAULT 0,
      event_date TEXT,
      event_end_date TEXT,
      room_nights INTEGER DEFAULT 0,
      pax INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS lead_owners (
      lead_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      added_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (lead_id, user_id),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      lead_id TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      conversation_id TEXT,
      body TEXT NOT NULL,
      attachments TEXT DEFAULT '[]',
      kind TEXT DEFAULT 'user',
      read_at TEXT,
      edited_at TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (to_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      is_group INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      last_read_at TEXT,
      PRIMARY KEY (conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS call_participants (
      call_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      PRIMARY KEY (call_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS team_calls (
      id TEXT PRIMARY KEY,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      offer_sdp TEXT,
      answer_sdp TEXT,
      created_at TEXT NOT NULL,
      answered_at TEXT,
      ended_at TEXT
    );

    CREATE TABLE IF NOT EXISTS team_call_signals (
      id TEXT PRIMARY KEY,
      call_id TEXT NOT NULL,
      from_user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      lead_id TEXT,
      call_id TEXT,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
      FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      lead_id TEXT,
      user_id TEXT NOT NULL,
      property_id TEXT,
      title TEXT NOT NULL,
      ref_number TEXT,
      status TEXT NOT NULL DEFAULT 'Draft',
      client_name TEXT,
      client_company TEXT,
      client_phone TEXT,
      client_email TEXT,
      event_date TEXT,
      event_type TEXT,
      venue TEXT,
      pax INTEGER DEFAULT 0,
      validity_date TEXT,
      payment_terms TEXT,
      cancellation_policy TEXT,
      tax_percent REAL DEFAULT 18,
      discount REAL DEFAULT 0,
      total_value REAL DEFAULT 0,
      line_items TEXT DEFAULT '[]',
      photos TEXT DEFAULT '[]',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      property_id TEXT,
      date TEXT NOT NULL,
      check_in_at TEXT,
      check_out_at TEXT,
      check_in_lat REAL,
      check_in_lng REAL,
      check_out_lat REAL,
      check_out_lng REAL,
      is_late INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'present',
      UNIQUE(user_id, date),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS geofence (
      id INTEGER PRIMARY KEY DEFAULT 1,
      name TEXT NOT NULL DEFAULT 'Hotel Premises',
      lat REAL NOT NULL DEFAULT 0,
      lng REAL NOT NULL DEFAULT 0,
      radius_meters REAL NOT NULL DEFAULT 500,
      checkin_cutoff TEXT NOT NULL DEFAULT '09:30',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS targets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      property_id TEXT,
      month TEXT NOT NULL,
      segment TEXT NOT NULL DEFAULT 'All',
      calls_target INTEGER DEFAULT 0,
      meetings_target INTEGER DEFAULT 0,
      revenue_target REAL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, month, segment),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS review_scores (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      month TEXT NOT NULL,
      calls_score REAL DEFAULT 0,
      meetings_score REAL DEFAULT 0,
      revenue_score REAL DEFAULT 0,
      pipeline_score REAL DEFAULT 0,
      total_score REAL DEFAULT 0,
      grade TEXT DEFAULT 'D',
      admin_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, month),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      agency_name TEXT,
      type TEXT NOT NULL DEFAULT 'Travel Agent',
      country TEXT,
      city TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      specialization TEXT,
      tier TEXT NOT NULL DEFAULT 'B',
      status TEXT NOT NULL DEFAULT 'Active',
      assigned_to TEXT,
      property_id TEXT,
      notes TEXT,
      created_by TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS agent_points (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      points INTEGER NOT NULL,
      reason TEXT NOT NULL,
      lead_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_vouchers (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      code TEXT NOT NULL,
      nights INTEGER NOT NULL,
      points_spent INTEGER NOT NULL,
      property_id TEXT,
      guest_name TEXT NOT NULL,
      event_date TEXT,
      event_end_date TEXT,
      status TEXT NOT NULL DEFAULT 'issued',
      created_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_offers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_by TEXT NOT NULL,
      recipient_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS agent_wallet (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      lead_id TEXT,
      incentive_id TEXT,
      month TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_incentives (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      task TEXT NOT NULL,
      metric TEXT NOT NULL,
      target_value REAL NOT NULL DEFAULT 0,
      pay_type TEXT NOT NULL,
      rate REAL NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_followups (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'Monthly',
      frequency_days INTEGER NOT NULL DEFAULT 30,
      last_contact_date TEXT,
      next_due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS proposal_sections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS proposal_item_templates (
      id TEXT PRIMARY KEY,
      section_id TEXT NOT NULL,
      description TEXT NOT NULL,
      default_rate REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (section_id) REFERENCES proposal_sections(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS terms_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_activity_log (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Call',
      outcome TEXT,
      notes TEXT,
      attachments TEXT NOT NULL DEFAULT '[]',
      contacted_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sales_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      month TEXT NOT NULL,
      focus TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      daily_agent_talks INTEGER NOT NULL DEFAULT 0,
      lead_rate REAL NOT NULL DEFAULT 0,
      monthly_agent_meetings INTEGER NOT NULL DEFAULT 0,
      monthly_agent_visits INTEGER NOT NULL DEFAULT 0,
      monthly_whatsapp_groups INTEGER NOT NULL DEFAULT 0,
      monthly_wedding_closes INTEGER NOT NULL DEFAULT 0,
      monthly_corporate_closes INTEGER NOT NULL DEFAULT 0,
      monthly_revenue REAL NOT NULL DEFAULT 0,
      daily_event_talks INTEGER NOT NULL DEFAULT 0,
      daily_incoming_calls INTEGER NOT NULL DEFAULT 0,
      daily_revenue REAL NOT NULL DEFAULT 0,
      UNIQUE(user_id, month),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS score_targets (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'individual',
      user_id TEXT,
      month TEXT NOT NULL,
      metric TEXT NOT NULL,
      target_value REAL NOT NULL DEFAULT 0,
      weight REAL NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS incentive_rules (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'individual',
      metric TEXT NOT NULL,
      name TEXT NOT NULL,
      calc TEXT NOT NULL DEFAULT 'per_unit',
      rate REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS incentives (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'individual',
      user_id TEXT,
      month TEXT NOT NULL,
      title TEXT NOT NULL,
      metric TEXT,
      amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'added',
      maker_id TEXT NOT NULL,
      approved_by TEXT,
      approved_at TEXT,
      paid_by TEXT,
      paid_at TEXT,
      note TEXT,
      rule_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS incentive_events (
      id TEXT PRIMARY KEY,
      incentive_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT,
      amount REAL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (incentive_id) REFERENCES incentives(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS person_incentives (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      month TEXT NOT NULL,
      task TEXT NOT NULL,
      metric TEXT NOT NULL,
      target_value REAL NOT NULL DEFAULT 0,
      pay_type TEXT NOT NULL,
      rate REAL NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_person_incentives_user_month ON person_incentives(user_id, month);
    CREATE INDEX IF NOT EXISTS idx_sales_plans_month ON sales_plans(month);
  `);

  // Run migrations for existing DBs (add new columns if missing)
  const migrations = [
    "ALTER TABLE calls ADD COLUMN property_id TEXT",
    "ALTER TABLE meetings ADD COLUMN property_id TEXT",
    "ALTER TABLE leads ADD COLUMN property_id TEXT",
    "ALTER TABLE attendance ADD COLUMN property_id TEXT",
    "ALTER TABLE targets ADD COLUMN property_id TEXT",
    "ALTER TABLE proposals ADD COLUMN property_id TEXT",
    "ALTER TABLE proposals ADD COLUMN ref_number TEXT",
    "ALTER TABLE proposals ADD COLUMN client_name TEXT",
    "ALTER TABLE proposals ADD COLUMN client_company TEXT",
    "ALTER TABLE proposals ADD COLUMN client_phone TEXT",
    "ALTER TABLE proposals ADD COLUMN client_email TEXT",
    "ALTER TABLE proposals ADD COLUMN event_date TEXT",
    "ALTER TABLE proposals ADD COLUMN event_type TEXT",
    "ALTER TABLE proposals ADD COLUMN venue TEXT",
    "ALTER TABLE proposals ADD COLUMN pax INTEGER DEFAULT 0",
    "ALTER TABLE proposals ADD COLUMN validity_date TEXT",
    "ALTER TABLE proposals ADD COLUMN payment_terms TEXT",
    "ALTER TABLE proposals ADD COLUMN cancellation_policy TEXT",
    "ALTER TABLE proposals ADD COLUMN tax_percent REAL DEFAULT 18",
    "ALTER TABLE proposals ADD COLUMN discount REAL DEFAULT 0",
    "ALTER TABLE proposals ADD COLUMN photos TEXT DEFAULT '[]'",
    "ALTER TABLE properties ADD COLUMN website TEXT",
    "ALTER TABLE properties ADD COLUMN brand_color TEXT NOT NULL DEFAULT '#2563eb'",
    "ALTER TABLE proposals ADD COLUMN terms TEXT DEFAULT ''",
    "ALTER TABLE meetings ADD COLUMN follow_up_date TEXT",
    "ALTER TABLE leads ADD COLUMN created_by TEXT",
    "ALTER TABLE leads ADD COLUMN event_end_date TEXT",
    "ALTER TABLE incentives ADD COLUMN person_incentive_id TEXT",
    "ALTER TABLE messages ADD COLUMN conversation_id TEXT",
    "ALTER TABLE messages ADD COLUMN attachments TEXT DEFAULT '[]'",
    "ALTER TABLE messages ADD COLUMN kind TEXT DEFAULT 'user'",
    "ALTER TABLE messages ADD COLUMN edited_at TEXT",
    "ALTER TABLE messages ADD COLUMN deleted_at TEXT",
    "ALTER TABLE team_calls ADD COLUMN conversation_id TEXT",
    "ALTER TABLE team_calls ADD COLUMN is_group INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE team_calls ADD COLUMN duration_sec INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE team_call_signals ADD COLUMN to_user_id TEXT",
    "ALTER TABLE agents ADD COLUMN user_id TEXT",
    "ALTER TABLE leads ADD COLUMN agent_id TEXT",
    "ALTER TABLE agents ADD COLUMN commission_type TEXT DEFAULT 'percent'",
    "ALTER TABLE agents ADD COLUMN commission_rate REAL DEFAULT 0",
  ];

  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  // Insert default geofence row if not exists
  const gf = db.prepare('SELECT id FROM geofence WHERE id=1').get();
  if (!gf) {
    db.prepare(`INSERT INTO geofence (id, name, lat, lng, radius_meters, checkin_cutoff) VALUES (1,'Hotel Premises',0,0,500,'09:30')`).run();
  }

  // Default settings
  const settingsDefaults: Record<string, string> = {
    hotel_name: 'Grand Hotel',
    hotel_tagline: 'Sales & Events',
    primary_color: '#2563eb',
  };
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(settingsDefaults)) {
    insertSetting.run(k, v);
  }

  // Seed admin user if none exists
  const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (count === 0) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    const { v4: uuidv4 } = require('uuid');
    db.prepare(`INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), 'Admin User', 'admin@hotel.com', hash, 'admin');
  }

  const callCenter = db.prepare('SELECT id FROM users WHERE email = ?').get('neha@hotel.com');
  if (!callCenter) {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    db.prepare(`INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), 'Neha Kapoor', 'neha@hotel.com', bcrypt.hashSync('call123', 10), 'call_center');
  }

  db.exec(`INSERT OR IGNORE INTO lead_owners (lead_id, user_id, added_by, created_at)
    SELECT id, user_id, user_id, COALESCE(created_at, datetime('now')) FROM leads
    WHERE user_id IS NOT NULL AND user_id != ''`);
  db.exec(`UPDATE leads SET created_by = user_id WHERE created_by IS NULL OR created_by = ''`);

  seedProposalCatalog(db);
  seedIncentives(db);
  seedSalesTeam(db);
  ensureAgentLogins(db);
  ensureHotels(db);
  spreadExistingRecordsAcrossHotels(db);
}

const DEFAULT_TERMS = `1. Validity
This proposal is valid until the date stated on the first page. Rates may be revised after that date.

2. Payment Terms
50% of the estimated value is payable as advance at the time of confirmation.
The balance is payable 7 days before the event or check-in.
GST is charged extra at the rate shown on this proposal.

3. Cancellation
30 days or more before the event: advance refunded, less a 10% booking fee.
15 to 29 days before: 50% of the advance is retained.
Less than 15 days before: the advance is non-refundable.
Room blocks: unsold rooms can be released 14 days prior without charge. Inside 14 days, one night is retained per room.

4. What is included
Rates cover only the line items listed. Extra guests, extended hours, additional power, and damages are billed at actuals.

5. Confirmation
Dates and venues are held only after written acceptance of this proposal and receipt of the advance.`;

function ensureAgentLogins(database: typeof db) {
  const bcrypt = require('bcryptjs');
  const { v4: uuidv4 } = require('uuid');
  const demos = [
    {
      email: 'amit@agent.com', name: 'Amit Sharma', agency: 'Amit Travels', city: 'Delhi',
      phone: '+91-98100-11001', ownerEmail: 'krishan@hotel.com',
    },
    {
      email: 'neelam@agent.com', name: 'Neelam Joshi', agency: 'Neelam Weddings', city: 'Jaipur',
      phone: '+91-98290-22002', ownerEmail: 'devraj@hotel.com',
    },
  ];
  const hash = bcrypt.hashSync('agent123', 10);
  for (const demo of demos) {
    let user = database.prepare('SELECT id FROM users WHERE email=?').get(demo.email) as { id: string } | undefined;
    if (!user) {
      const id = uuidv4();
      database.prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?,?,?,?,?)').run(id, demo.name, demo.email, hash, 'agent');
      user = { id };
    }
    const owner = database.prepare('SELECT id FROM users WHERE email=?').get(demo.ownerEmail) as { id: string } | undefined;
    let agent = database.prepare('SELECT id FROM agents WHERE email=?').get(demo.email) as { id: string } | undefined;
    if (!agent) {
      const id = uuidv4();
      database.prepare(`INSERT INTO agents (id, name, agency_name, type, city, country, phone, email, tier, status, assigned_to, user_id, notes, created_by)
        VALUES (?,?,?,?,?,?,?,?, 'A', 'Active', ?, ?, ?, ?)`).run(
        id, demo.name, demo.agency, 'Travel Agent', demo.city, 'India', demo.phone, demo.email,
        owner?.id || null, user.id, 'Agent club login', user.id,
      );
      agent = { id };
    } else {
      database.prepare('UPDATE agents SET user_id=? WHERE id=? AND (user_id IS NULL OR user_id=\'\')').run(user.id, agent.id);
    }
  }
  if (!database.prepare(`SELECT value FROM settings WHERE key='agent_loyalty'`).get()) {
    database.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('agent_loyalty', JSON.stringify({
      tiers: [
        { name: 'Partner', lifetime: 0, multiplier: 1, nightPrice: 8000 },
        { name: 'Silver', lifetime: 50000, multiplier: 1.25, nightPrice: 6000 },
        { name: 'Gold', lifetime: 200000, multiplier: 1.5, nightPrice: 5000 },
      ],
    }));
  }
  if (!database.prepare(`SELECT value FROM settings WHERE key='agent_pay_seeded'`).get()) {
    const amit = database.prepare(`SELECT id FROM agents WHERE email='amit@agent.com'`).get() as { id: string } | undefined;
    const neelam = database.prepare(`SELECT id FROM agents WHERE email='neelam@agent.com'`).get() as { id: string } | undefined;
    if (amit) {
      database.prepare(`UPDATE agents SET commission_type='percent', commission_rate=8 WHERE id=?`).run(amit.id);
      database.prepare(`INSERT INTO agent_incentives (id, agent_id, task, metric, target_value, pay_type, rate, created_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(uuidv4(), amit.id, '5 enquiries this month', 'enquiries', 5, 'fixed', 2000, new Date().toISOString());
      database.prepare(`INSERT INTO agent_wallet (id, agent_id, amount, reason, note, created_at) VALUES (?,?,?,?,?,?)`).run(
        uuidv4(), amit.id, 4000, 'opening', 'Earlier confirmed stay', new Date().toISOString(),
      );
    }
    if (neelam) {
      database.prepare(`UPDATE agents SET commission_type='fixed', commission_rate=5000 WHERE id=?`).run(neelam.id);
    }
    database.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('agent_pay_seeded', '1');
  }
}

function ensureHotels(database: typeof db) {
  const already = database.prepare(`SELECT value FROM settings WHERE key='hotels_bootstrapped'`).get() as { value: string } | undefined;
  if (already) return;
  const { v4: uuidv4 } = require('uuid');
  const insert = database.prepare(`INSERT INTO properties (id,name,address,city,phone,email,website,gst_number,brand_color)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const count = (database.prepare('SELECT COUNT(*) as c FROM properties').get() as { c: number }).c;
  if (count === 0) {
    insert.run(uuidv4(), 'Aayor Grand Hotel', 'MG Road, Connaught Place', 'New Delhi', '+91-11-4567-8900', 'reservations@aayorgrand.com', 'www.aayor.com', '07AAYOR0001A1Z5', '#2563eb');
  }
  database.prepare(`UPDATE properties SET gst_number='07AAYOR0001A1Z5', website='www.aayor.com'
    WHERE name='Aayor Grand Hotel' AND (gst_number IS NULL OR gst_number='')`).run();
  const named = (database.prepare('SELECT COUNT(*) as c FROM properties').get() as { c: number }).c;
  if (named < 3) {
    const extras: [string, string, string, string, string, string, string, string][] = [
      ['Aayor Palace', 'Civil Lines, C-Scheme', 'Jaipur', '+91-141-400-2200', 'jaipur@aayor.com', 'www.aayor.com', '08AAYOR0002A1Z3', '#9a3412'],
      ['Aayor Beach Resort', 'Candolim Beach Road', 'Goa', '+91-832-671-4400', 'goa@aayor.com', 'www.aayor.com', '30AAYOR0003A1Z8', '#0f766e'],
    ];
    for (const row of extras) {
      if ((database.prepare('SELECT COUNT(*) as c FROM properties').get() as { c: number }).c >= 3) break;
      if (!database.prepare('SELECT id FROM properties WHERE name=?').get(row[0])) insert.run(uuidv4(), ...row);
    }
  }
  const hotels = database.prepare('SELECT id FROM properties WHERE active=1 ORDER BY name').all() as { id: string }[];
  if (hotels.length) {
    const leads = database.prepare(`SELECT id FROM leads WHERE property_id IS NULL OR property_id=''`).all() as { id: string }[];
    const setLead = database.prepare('UPDATE leads SET property_id=? WHERE id=?');
    leads.forEach((lead, i) => setLead.run(hotels[i % hotels.length].id, lead.id));
    const calls = database.prepare(`SELECT id FROM calls WHERE property_id IS NULL OR property_id=''`).all() as { id: string }[];
    const setCall = database.prepare('UPDATE calls SET property_id=? WHERE id=?');
    calls.forEach((call, i) => setCall.run(hotels[i % hotels.length].id, call.id));
    database.prepare(`UPDATE proposals SET property_id = (
      SELECT l.property_id FROM leads l WHERE l.id = proposals.lead_id
    ) WHERE (property_id IS NULL OR property_id='') AND lead_id IS NOT NULL AND lead_id != ''`).run();
    database.prepare(`UPDATE proposals SET property_id=? WHERE property_id IS NULL OR property_id=''`).run(hotels[0].id);
  }
  database.prepare(`INSERT INTO settings (key, value) VALUES ('hotels_bootstrapped','1')`).run();
}

function spreadExistingRecordsAcrossHotels(database: typeof db) {
  const already = database.prepare(`SELECT value FROM settings WHERE key='hotels_spread'`).get() as { value: string } | undefined;
  if (already) return;
  const hotels = database.prepare('SELECT id FROM properties WHERE active=1 ORDER BY name').all() as { id: string }[];
  if (hotels.length < 2) {
    database.prepare(`INSERT INTO settings (key, value) VALUES ('hotels_spread','1')`).run();
    return;
  }
  const leads = database.prepare('SELECT id FROM leads ORDER BY created_at, id').all() as { id: string }[];
  const setLead = database.prepare('UPDATE leads SET property_id=? WHERE id=?');
  leads.forEach((lead, i) => setLead.run(hotels[i % hotels.length].id, lead.id));
  const calls = database.prepare('SELECT id FROM calls ORDER BY created_at, id').all() as { id: string }[];
  const setCall = database.prepare('UPDATE calls SET property_id=? WHERE id=?');
  calls.forEach((call, i) => setCall.run(hotels[i % hotels.length].id, call.id));
  database.prepare(`UPDATE proposals SET property_id = (
    SELECT l.property_id FROM leads l WHERE l.id = proposals.lead_id
  ) WHERE lead_id IS NOT NULL AND lead_id != ''`).run();
  const loose = database.prepare(`SELECT id FROM proposals WHERE lead_id IS NULL OR lead_id='' ORDER BY created_at, id`).all() as { id: string }[];
  const setProposal = database.prepare('UPDATE proposals SET property_id=? WHERE id=?');
  loose.forEach((row, i) => setProposal.run(hotels[i % hotels.length].id, row.id));
  database.prepare(`INSERT INTO settings (key, value) VALUES ('hotels_spread','1')`).run();
}

function seedProposalCatalog(database: typeof db) {
  const { v4: uuidv4 } = require('uuid');
  const sectionCount = (db.prepare('SELECT COUNT(*) as c FROM proposal_sections').get() as any).c;
  if (sectionCount === 0) {
    const sections = ['Accommodation', 'Food & Beverage', 'Event Services', 'AV & Decor', 'Transfers & Logistics', 'Other'];
    const insertSection = db.prepare('INSERT INTO proposal_sections (id, name, sort_order) VALUES (?,?,?)');
    const insertItem = db.prepare('INSERT INTO proposal_item_templates (id, section_id, description, default_rate) VALUES (?,?,?,?)');
    const items: Record<string, [string, number][]> = {
      'Accommodation': [['Deluxe Room — Single occupancy', 8500], ['Deluxe Room — Double occupancy', 10500], ['Suite upgrade', 18000], ['Extra bed', 1500]],
      'Food & Beverage': [['Welcome hi-tea per person', 750], ['Lunch buffet per person', 1450], ['Gala dinner per person', 2200], ['Coffee break per person', 450]],
      'Event Services': [['Ballroom rental — full day', 85000], ['Meeting room — half day', 25000], ['Stage, podium and branding wall', 35000]],
      'AV & Decor': [['LED wall and sound system', 45000], ['Floral decor package', 60000], ['Uplighting and dance floor', 28000]],
      'Transfers & Logistics': [['Airport transfer — sedan', 2200], ['Coach transfer — 35 seater', 8500]],
      'Other': [['Service charge and coordination', 15000]],
    };
    sections.forEach((name, i) => {
      const id = uuidv4();
      insertSection.run(id, name, i + 1);
      for (const [description, rate] of items[name]) insertItem.run(uuidv4(), id, description, rate);
    });
  }

  const termsCount = (db.prepare('SELECT COUNT(*) as c FROM terms_templates').get() as any).c;
  if (termsCount === 0) {
    const insertTerms = db.prepare('INSERT INTO terms_templates (id, name, body, is_default) VALUES (?,?,?,?)');
    insertTerms.run(uuidv4(), 'Standard Hotel Terms', DEFAULT_TERMS, 1);
    insertTerms.run(uuidv4(), 'Wedding Package Terms', `${DEFAULT_TERMS}

6. Wedding specifics
The venue is handed over 4 hours before the function for decor. Music must end by 11:30 pm unless an extension is confirmed in writing. Outside catering is not permitted.`, 0);
    insertTerms.run(uuidv4(), 'Corporate Room Block Terms', `1. Room block
Rooms are held at the quoted rate until the cutoff date, 21 days before arrival.
Unpicked rooms are released to general inventory after the cutoff.

2. Billing
Room and tax are billed to the company. Incidentals are billed to the guest unless a master bill is agreed in writing.
GST is extra as applicable.

3. Cancellation
Individual rooms cancelled inside 48 hours of arrival are charged one night.
Group attrition above 20% of the blocked rooms is charged at one night per room.

4. Confirmation
The block is confirmed only after this proposal is accepted and the advance is received.`, 0);
  }

  const defaultTerms = (db.prepare('SELECT body FROM terms_templates WHERE is_default=1 AND active=1 ORDER BY updated_at DESC LIMIT 1').get() as any)?.body
    || (db.prepare('SELECT body FROM terms_templates WHERE active=1 LIMIT 1').get() as any)?.body
    || DEFAULT_TERMS;
  db.prepare(`UPDATE proposals SET terms = ? WHERE terms IS NULL OR terms = ''`).run(defaultTerms);
}

export default db;
