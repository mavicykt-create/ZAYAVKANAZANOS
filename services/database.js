const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/zan11.db');
let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function initDB() {
  const db = getDB();

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'staff' CHECK(role IN ('admin', 'staff')),
      is_active INTEGER DEFAULT 1,
      last_login_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Products table - добавляем поля для картинок
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      vendor_code TEXT,
      picture TEXT,
      picture_original TEXT,
      description TEXT,
      price REAL,
      barcode TEXT,
      expiry_date TEXT,
      stock_quantity INTEGER DEFAULT 0,
      hidden_from_product_check INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    )
  `);

  // Carry requests table
  db.exec(`
    CREATE TABLE IF NOT EXISTS carry_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )
  `);

  // Price check pages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_check_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      page_number INTEGER NOT NULL,
      locked_by INTEGER,
      locked_at DATETIME,
      UNIQUE(category_id, page_number)
    )
  `);

  // Price check items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_check_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      has_problem INTEGER DEFAULT 0,
      price_checked INTEGER DEFAULT 0,
      checked_by INTEGER,
      checked_at DATETIME
    )
  `);

  // Weekly calendar items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS weekly_calendar_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      title TEXT NOT NULL,
      text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User actions log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_actions_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User daily stats table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date DATE DEFAULT CURRENT_DATE,
      carry_categories INTEGER DEFAULT 0,
      product_changes INTEGER DEFAULT 0,
      price_categories INTEGER DEFAULT 0,
      marks INTEGER DEFAULT 0,
      prints INTEGER DEFAULT 0,
      mistakes INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      UNIQUE(user_id, date)
    )
  `);

  // Sync status table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_status (
      id INTEGER PRIMARY KEY,
      last_sync_at DATETIME,
      status TEXT DEFAULT 'idle',
      progress INTEGER DEFAULT 0,
      stage TEXT,
      message TEXT,
      products_count INTEGER DEFAULT 0
    )
  `);

  // ===== НОВЫЕ ТАБЛИЦЫ ДЛЯ СОВМЕСТНОЙ РАБОТЫ =====

  // Completed categories table - для отслеживания завершённых категорий
  db.exec(`
    CREATE TABLE IF NOT EXISTS completed_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id)
    )
  `);

  // Collected items table - для отслеживания собранных товаров (видно всем)
  db.exec(`
    CREATE TABLE IF NOT EXISTS collected_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_id)
    )
  `);

  // Assembly sessions table - для сессий сборки
  db.exec(`
    CREATE TABLE IF NOT EXISTS assembly_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT 'Сборка',
      status TEXT DEFAULT 'active',
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )
  `);

  // ===== ТАБЛИЦЫ ДЛЯ ЦВЕТНЫХ КРУЖКОВ =====

  // User colors table - цвета для каждого пользователя
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_colors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      color TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Product clicks table - кто нажал на какой товар
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_id, user_id)
    )
  `);

  // ===== НОВАЯ ТАБЛИЦА ДЛЯ ПРОВЕРКИ ЦЕННИКОВ =====

  // Price check marks table - новая система отметок для ценников
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_check_marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      mark_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_id)
    )
  `);

  // Insert default categories
  const categories = [
    { id: 54, name: 'Жидкие конфеты' },
    { id: 57, name: 'Карамель, леденцы, шипучки' },
    { id: 65, name: 'Шоколад' },
    { id: 81, name: 'Пирожные, бисквиты, печенье' },
    { id: 85, name: 'Мармелад, зефир, драже' },
    { id: 92, name: 'Жевательная резинка' },
    { id: 97, name: 'Жевательные конфеты' },
    { id: 101, name: 'ЛЕТО26' },
    { id: 105, name: 'Бакалея' }
  ];

  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)');
  categories.forEach(c => insertCat.run(c.id, c.name));

  // Insert default users
  const adminHash = bcrypt.hashSync('7895123', 10);
  const userHash = bcrypt.hashSync('7895123', 10);

  db.prepare(`INSERT OR IGNORE INTO users (id, login, password_hash, role, is_active) 
    VALUES (1, 'admin', ?, 'admin', 1)`).run(adminHash);
  db.prepare(`INSERT OR IGNORE INTO users (id, login, password_hash, role, is_active) 
    VALUES (2, 'user', ?, 'staff', 1)`).run(userHash);

  // Insert additional users with 4-digit passwords
  const users = [
    { id: 3, login: 'jeka', password: '1234' },
    { id: 4, login: 'vova', password: '2345' },
    { id: 5, login: 'darhan', password: '3456' },
    { id: 6, login: 'arian', password: '4567' },
    { id: 7, login: 'grisha', password: '5678' },
    { id: 8, login: 'sanya', password: '6789' }
  ];

  users.forEach(u => {
    const hash = bcrypt.hashSync(u.password, 10);
    db.prepare(`INSERT OR IGNORE INTO users (id, login, password_hash, role, is_active) 
      VALUES (?, ?, ?, 'staff', 1)`).run(u.id, u.login, hash);
  });

  // Insert user colors
  const userColors = [
    { user_id: 1, color: '#FF3B30' }, // admin - красный
    { user_id: 2, color: '#007AFF' }, // user - синий
    { user_id: 3, color: '#34C759' }, // jeka - зеленый
    { user_id: 4, color: '#FF9500' }, // vova - оранжевый
    { user_id: 5, color: '#AF52DE' }, // darhan - фиолетовый
    { user_id: 6, color: '#5856D6' }, // arian - индиго
    { user_id: 7, color: '#FF2D55' }, // grisha - розовый
    { user_id: 8, color: '#5AC8FA' }  // sanya - голубой
  ];

  const insertColor = db.prepare('INSERT OR IGNORE INTO user_colors (user_id, color) VALUES (?, ?)');
  userColors.forEach(uc => insertColor.run(uc.user_id, uc.color));

  // ===== ТАБЛИЦЫ ДЛЯ TO-DO ЗАДАЧ =====

  // Todo items table - задачи для сотрудников
  db.exec(`
    CREATE TABLE IF NOT EXISTS todo_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      is_completed INTEGER DEFAULT 0,
      completed_by INTEGER,
      completed_by_name TEXT,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Init sync status
  db.prepare(`INSERT OR IGNORE INTO sync_status (id) VALUES (1)`).run();

  console.log('Database initialized');
}

module.exports = { getDB, initDB };
