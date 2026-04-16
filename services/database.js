/**
 * ZAN 1.1 - Database Service
 * SQLite database with better-sqlite3
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/zan11.db');

let db = null;

function getDB() {
  if (!db) {
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function initializeDB() {
  const database = getDB();
  
  // Users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      is_active INTEGER DEFAULT 1,
      last_login_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Categories table
  database.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Products table
  database.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      category_id INTEGER,
      name TEXT NOT NULL,
      vendor_code TEXT,
      picture TEXT,
      price REAL,
      barcode TEXT,
      stock_quantity INTEGER DEFAULT 0,
      hidden_from_product_check INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);
  
  // Carry requests table
  database.exec(`
    CREATE TABLE IF NOT EXISTS carry_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'collected', 'completed')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);
  
  // Price check pages table
  database.exec(`
    CREATE TABLE IF NOT EXISTS price_check_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      page_number INTEGER NOT NULL,
      locked_by INTEGER,
      locked_at DATETIME,
      UNIQUE(category_id, page_number),
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (locked_by) REFERENCES users(id)
    )
  `);
  
  // Price check items table
  database.exec(`
    CREATE TABLE IF NOT EXISTS price_check_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      has_problem INTEGER DEFAULT 0,
      price_checked INTEGER DEFAULT 0,
      checked_by INTEGER,
      checked_at DATETIME,
      FOREIGN KEY (page_id) REFERENCES price_check_pages(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (checked_by) REFERENCES users(id)
    )
  `);
  
  // Calendar items table
  database.exec(`
    CREATE TABLE IF NOT EXISTS weekly_calendar_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      title TEXT NOT NULL,
      text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Sync status table
  database.exec(`
    CREATE TABLE IF NOT EXISTS sync_status (
      id INTEGER PRIMARY KEY DEFAULT 1,
      status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'completed', 'error')),
      progress INTEGER DEFAULT 0,
      stage TEXT,
      message TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // User actions log
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_actions_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // User daily stats
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date DATE NOT NULL,
      carry_categories INTEGER DEFAULT 0,
      product_changes INTEGER DEFAULT 0,
      price_categories INTEGER DEFAULT 0,
      marks INTEGER DEFAULT 0,
      prints INTEGER DEFAULT 0,
      mistakes INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      UNIQUE(user_id, date),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // Create default admin user if not exists
  const bcrypt = require('bcryptjs');
  const adminExists = database.prepare('SELECT id FROM users WHERE login = ?').get('admin');
  
  if (!adminExists) {
    const hash = bcrypt.hashSync('7895123', 10);
    database.prepare(`
      INSERT INTO users (login, password_hash, role, is_active)
      VALUES (?, ?, 'admin', 1)
    `).run('admin', hash);
    
    database.prepare(`
      INSERT INTO users (login, password_hash, role, is_active)
      VALUES (?, ?, 'user', 1)
    `).run('user', bcrypt.hashSync('7895123', 10));
    
    console.log('Default users created: admin/user with password 7895123');
  }
  
  // Initialize sync status
  const syncExists = database.prepare('SELECT id FROM sync_status WHERE id = 1').get();
  if (!syncExists) {
    database.prepare('INSERT INTO sync_status (id, status) VALUES (1, ?)').run('idle');
  }
  
  console.log('Database initialized successfully');
}

module.exports = { getDB, initializeDB };
