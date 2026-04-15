import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

const DB_DIR = process.env.DB_DIR || '/data';
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

export async function initDb() {
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
      stock_quantity INTEGER DEFAULT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(category_id, vendor_code)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS active_order_categories (
      category_id INTEGER PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'open',
      locked_by TEXT DEFAULT NULL,
      locked_at INTEGER DEFAULT NULL,
      completed_at INTEGER DEFAULT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS active_order_items (
      product_id INTEGER PRIMARY KEY,
      qty INTEGER NOT NULL DEFAULT 0,
      picked INTEGER NOT NULL DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}
