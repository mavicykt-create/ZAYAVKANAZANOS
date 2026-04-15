import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), 'data');
const DB_FILE = process.env.DB_FILE || path.join(DB_DIR, 'warehouse-order.sqlite');

fs.mkdirSync(DB_DIR, { recursive: true });

export const db = new sqlite3.Database(DB_FILE);

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function tableHasColumn(tableName, columnName) {
  const rows = await all(`PRAGMA table_info(${tableName})`);
  return rows.some((row) => row.name === columnName);
}

async function ensureColumn(tableName, columnName, definition) {
  const exists = await tableHasColumn(tableName, columnName);
  if (!exists) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'staff')),
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at INTEGER DEFAULT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await ensureColumn('users', 'last_login_at', 'INTEGER DEFAULT NULL');

  await run(`
    CREATE TABLE IF NOT EXISTS catalog_categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS catalog_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      vendor_code TEXT NOT NULL,
      picture TEXT,
      cached_image TEXT DEFAULT '',
      description TEXT DEFAULT '',
      price REAL DEFAULT 0,
      barcode TEXT DEFAULT '',
      stock_quantity INTEGER DEFAULT NULL,
      hidden_from_product_check INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      UNIQUE(category_id, vendor_code)
    )
  `);
  await ensureColumn('catalog_products', 'barcode', "TEXT DEFAULT ''");
  await ensureColumn('catalog_products', 'updated_at', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('catalog_products', 'hidden_from_product_check', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('catalog_products', 'cached_image', "TEXT DEFAULT ''");

  await run(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS carry_order_items (
      product_id INTEGER PRIMARY KEY,
      qty INTEGER NOT NULL DEFAULT 0,
      picked INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS carry_category_confirmations (
      category_id INTEGER PRIMARY KEY,
      confirmed_by INTEGER DEFAULT NULL,
      confirmed_at INTEGER DEFAULT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS price_check_pages (
      category_id INTEGER NOT NULL,
      page_number INTEGER NOT NULL,
      locked_by INTEGER DEFAULT NULL,
      locked_at INTEGER DEFAULT NULL,
      completed_by INTEGER DEFAULT NULL,
      completed_at INTEGER DEFAULT NULL,
      PRIMARY KEY (category_id, page_number)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS price_check_items (
      product_id INTEGER PRIMARY KEY,
      problem_flag INTEGER NOT NULL DEFAULT 0,
      price_flag INTEGER NOT NULL DEFAULT 0,
      updated_by INTEGER DEFAULT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await ensureColumn('price_check_items', 'problem_flag', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('price_check_items', 'price_flag', 'INTEGER NOT NULL DEFAULT 0');

  await run(`
    CREATE TABLE IF NOT EXISTS weekly_calendar_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      created_by INTEGER DEFAULT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      keys_auth TEXT NOT NULL,
      keys_p256dh TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_actions_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      module TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      score_delta INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_daily_stats (
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      actions_count INTEGER NOT NULL DEFAULT 0,
      work_score INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, date)
    )
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_catalog_products_category ON catalog_products(category_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_catalog_products_name ON catalog_products(name COLLATE NOCASE)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_carry_order_qty ON carry_order_items(qty)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_price_pages_locked ON price_check_pages(locked_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_price_items_flags ON price_check_items(problem_flag, price_flag)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_calendar_date ON weekly_calendar_items(date)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_actions_user_created ON user_actions_log(user_id, created_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_actions_created ON user_actions_log(created_at)`);
}
