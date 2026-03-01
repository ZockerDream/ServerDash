const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './data/serverdash.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    email       TEXT,
    role        TEXT    NOT NULL DEFAULT 'viewer',
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login  TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    username   TEXT,
    action     TEXT    NOT NULL,
    details    TEXT,
    ip         TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Migration: add ssh_key column if not present
try {
  db.exec('ALTER TABLE users ADD COLUMN ssh_key TEXT');
} catch (_) { /* column already exists */ }

// Seed default admin if no users exist
const existing = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
if (existing.cnt === 0) {
  const hash = bcrypt.hashSync('Admin1234!', 12);
  db.prepare(`
    INSERT INTO users (username, password, role)
    VALUES ('admin', ?, 'admin')
  `).run(hash);
  console.log('[DB] Default admin created — username: admin  password: Admin1234!');
  console.log('[DB] *** CHANGE THE PASSWORD IMMEDIATELY ***');
}

module.exports = db;
