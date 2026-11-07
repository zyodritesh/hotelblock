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
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft',
      total_value REAL DEFAULT 0,
      line_items TEXT DEFAULT '[]',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
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
  `);

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
}

export default db;
