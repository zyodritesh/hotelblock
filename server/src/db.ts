import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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
      room_nights INTEGER DEFAULT 0,
      pax INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
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

  seedProposalCatalog(db);
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
