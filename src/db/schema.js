import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDb } from './connection.js';

export async function initDb() {
  const db = await getDb();
  await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','staff')),
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      vendor_code TEXT NOT NULL,
      picture TEXT,
      picture_cached TEXT,
      description TEXT,
      price REAL DEFAULT 0,
      barcode TEXT,
      stock_quantity REAL DEFAULT 0,
      hidden_from_product_check INTEGER NOT NULL DEFAULT 0,
      sort_name TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(vendor_code),
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL DEFAULT 'idle',
      progress_percent INTEGER NOT NULL DEFAULT 0,
      stage TEXT,
      message TEXT,
      last_started_at TEXT,
      last_finished_at TEXT,
      last_error TEXT,
      items_total INTEGER NOT NULL DEFAULT 0,
      items_done INTEGER NOT NULL DEFAULT 0,
      reset_requested INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS carry_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, category_id, product_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS carry_category_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS carry_order_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS price_check_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      page_number INTEGER NOT NULL,
      locked_by INTEGER,
      locked_at TEXT,
      UNIQUE(category_id, page_number),
      FOREIGN KEY(category_id) REFERENCES categories(id),
      FOREIGN KEY(locked_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS price_check_marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      is_problem INTEGER NOT NULL DEFAULT 0,
      is_price_tag INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS weekly_calendar_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      subscription_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_actions_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      entity_id TEXT,
      payload_json TEXT,
      score_delta INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      stat_date TEXT NOT NULL,
      work_score INTEGER NOT NULL DEFAULT 0,
      actions_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, stat_date),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    INSERT OR IGNORE INTO sync_state (id, status, progress_percent, stage, message) VALUES (1, 'idle', 0, 'Ожидание', 'Синхронизация еще не запускалась');
  `);

  const categories = [
    [54, 'Жидкие конфеты', 1],
    [57, 'Карамель, леденцы, шипучки', 2],
    [65, 'Шоколад', 3],
    [81, 'Пирожные, бисквиты, печенье', 4],
    [85, 'Мармелад, зефир, драже', 5],
    [92, 'Жевательная резинка', 6],
    [97, 'Жевательные конфеты', 7],
    [101, 'ЛЕТО26', 8],
    [105, 'Бакалея', 9]
  ];

  for (const [id, name, sortOrder] of categories) {
    await db.run(
      'INSERT OR IGNORE INTO categories (id, name, sort_order) VALUES (?, ?, ?)',
      [id, name, sortOrder]
    );
  }

  const defaults = [
    ['admin', '7895123', 'admin'],
    ['user', '7895123', 'staff']
  ];

  for (const [login, password, role] of defaults) {
    const row = await db.get('SELECT id FROM users WHERE login = ?', [login]);
    if (!row) {
      const passwordHash = await bcrypt.hash(password, 10);
      await db.run(
        'INSERT INTO users (login, password_hash, role, is_active) VALUES (?, ?, ?, 1)',
        [login, passwordHash, role]
      );
    }
  }

  return db;
}

export function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}
