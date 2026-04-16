import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { DB_PATH, FIXED_CATEGORIES } from './config.js';
import { ensureDir } from './utils/fs.js';
import { nowIso } from './utils/time.js';

ensureDir('/data');
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'staff')),
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      vendor_code TEXT,
      picture TEXT,
      picture_cached TEXT,
      description TEXT,
      price REAL DEFAULT 0,
      barcode TEXT,
      stock_quantity REAL DEFAULT 0,
      hidden_from_product_check INTEGER NOT NULL DEFAULT 0,
      sort_name TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(external_id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS sync_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      is_running INTEGER NOT NULL DEFAULT 0,
      percent INTEGER NOT NULL DEFAULT 0,
      stage TEXT,
      message TEXT,
      started_at TEXT,
      finished_at TEXT,
      last_success_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS carry_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      is_checked INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, item_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS carry_category_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      completed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_check_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      page_number INTEGER NOT NULL,
      locked_by INTEGER,
      locked_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(category_id, page_number),
      FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS price_check_marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      status_problem INTEGER NOT NULL DEFAULT 0,
      status_price INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, item_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS weekly_calendar_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      endpoint TEXT UNIQUE NOT NULL,
      keys_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_actions_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action_type TEXT NOT NULL,
      payload_json TEXT,
      score_delta INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      stat_date TEXT NOT NULL,
      action_count INTEGER NOT NULL DEFAULT 0,
      work_score INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, stat_date)
    );
  `);

  const now = nowIso();
  for (const c of FIXED_CATEGORIES) {
    db.prepare(`INSERT INTO categories (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name`).run(c.id, c.name);
  }

  db.prepare(`
    INSERT INTO sync_status (id, is_running, percent, stage, message, updated_at)
    VALUES (1, 0, 0, 'idle', 'Ожидание', ?)
    ON CONFLICT(id) DO NOTHING
  `).run(now);

  seedUser('admin', '7895123', 'admin');
  seedUser('user', '7895123', 'staff');
}

function seedUser(login, password, role) {
  const existing = db.prepare(`SELECT id FROM users WHERE login = ?`).get(login);
  if (existing) return;
  const now = nowIso();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (login, password_hash, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
  `).run(login, hash, role, now, now);
}
