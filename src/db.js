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
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

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
      price REAL DEFAULT 0,
      description TEXT DEFAULT '',
      barcode TEXT DEFAULT '',
      stock_quantity INTEGER DEFAULT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      UNIQUE(category_id, vendor_code)
    )
  `);

  await ensureColumn('catalog_products', 'barcode', "TEXT DEFAULT ''");
  await ensureColumn('catalog_products', 'updated_at', 'INTEGER NOT NULL DEFAULT 0');

  await run(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS module_category_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module TEXT NOT NULL CHECK(module IN ('carry', 'price_check')),
      category_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'free' CHECK(status IN ('free', 'locked', 'completed')),
      locked_by INTEGER DEFAULT NULL,
      locked_at INTEGER DEFAULT NULL,
      completed_at INTEGER DEFAULT NULL,
      UNIQUE(module, category_id)
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
    CREATE TABLE IF NOT EXISTS price_check_items (
      product_id INTEGER PRIMARY KEY,
      no_stock INTEGER NOT NULL DEFAULT 0,
      no_price_tag INTEGER NOT NULL DEFAULT 0,
      updated_by INTEGER DEFAULT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_catalog_products_category ON catalog_products(category_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_module_category_state_module ON module_category_state(module, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_price_check_flags ON price_check_items(no_stock, no_price_tag)`);
}
