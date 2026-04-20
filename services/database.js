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
      box_count INTEGER DEFAULT 0,
      block_count INTEGER DEFAULT 0,
      hidden_from_product_check INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: add box_count and block_count if they don't exist (for existing DBs)
  try {
    db.prepare('SELECT box_count FROM products LIMIT 1').get();
  } catch (e) {
    db.exec('ALTER TABLE products ADD COLUMN box_count INTEGER DEFAULT 0');
    db.exec('ALTER TABLE products ADD COLUMN block_count INTEGER DEFAULT 0');
    console.log('Migration: added box_count and block_count columns');
  }

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
      new_expiry TEXT,
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
    const role = u.login === 'arian' ? 'admin' : 'staff';
    db.prepare(`INSERT OR IGNORE INTO users (id, login, password_hash, role, is_active)
      VALUES (?, ?, ?, ?, 1)`).run(u.id, u.login, hash, role);
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

  // ===== ТАБЛИЦА ДЛЯ НАЧАЛА СМЕНЫ =====

  // Shift start table - отслеживание начала рабочего дня
  db.exec(`
    CREATE TABLE IF NOT EXISTS shift_start (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      start_time_yakutsk TEXT,
      status TEXT DEFAULT 'on_time',
      date TEXT DEFAULT CURRENT_DATE,
      UNIQUE(user_id, date)
    )
  `);

  // ===== ТАБЛИЦЫ ДЛЯ ПРЕТЕНЗИЙ =====

  // Claims table - претензии от покупателей
  db.exec(`
    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      check_number TEXT,
      purchase_time TEXT,
      order_info TEXT,
      missing_products TEXT,
      claim_text TEXT NOT NULL,
      attachment_path TEXT,
      attachment_type TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'approved', 'rejected')),
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    )
  `);

  // Claim tasks table - задачи по рассмотрению претензий
  db.exec(`
    CREATE TABLE IF NOT EXISTS claim_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id INTEGER NOT NULL,
      assigned_to INTEGER,
      assigned_to_name TEXT,
      resolution TEXT,
      evidence_path TEXT,
      evidence_type TEXT,
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
      verdict TEXT CHECK(verdict IN ('approved', 'rejected', NULL)),
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    )
  `);

  // ===== ТАБЛИЦА ПРАЗДНИЧНЫХ ДНЕЙ =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ===== ТАБЛИЦА ИМЕННЫХ ЗАДАЧ (назначение сотрудников) =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS todo_assignees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      UNIQUE(todo_id, user_id)
    )
  `);

  // ===== ТАБЛИЦА ПРОФИЛЕЙ СОТРУДНИКОВ =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      avatar_path TEXT,
      phone TEXT,
      email TEXT,
      bio TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ===== ТАБЛИЦА ДОКУМЕНТОВ СОТРУДНИКОВ =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ===== ТАБЛИЦА ЧАТА =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ===== ТАБЛИЦА ЗАПРОСОВ (ОТПУСК, АВАНС) =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      request_type TEXT NOT NULL CHECK(request_type IN ('vacation', 'advance')),
      description TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      resolved_by INTEGER
    )
  `);

  // ===== ТАБЛИЦА СПЕЦ ЗАДАНИЙ =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS special_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      description TEXT NOT NULL,
      complexity INTEGER DEFAULT 3 CHECK(complexity BETWEEN 1 AND 5),
      photo_path TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      admin_comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      resolved_by INTEGER
    )
  `);

  // ===== ТАБЛИЦА ШКАЛЫ СЛОЖНОСТИ =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS complexity_scale (
      id INTEGER PRIMARY KEY,
      level INTEGER NOT NULL UNIQUE,
      label TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default complexity scale if empty
  const scaleCount = db.prepare('SELECT COUNT(*) as count FROM complexity_scale').get().count;
  if (scaleCount === 0) {
    const scaleLabels = [
      { level: 1, label: 'Очень легко' },
      { level: 2, label: 'Легко' },
      { level: 3, label: 'Средне' },
      { level: 4, label: 'Сложно' },
      { level: 5, label: 'Очень сложно' }
    ];
    const insertScale = db.prepare('INSERT INTO complexity_scale (level, label) VALUES (?, ?)');
    scaleLabels.forEach(s => insertScale.run(s.level, s.label));
  }

  // ===== ТАБЛИЦА ПРОВЕРЕННЫХ СРОКОВ ГОДНОСТИ =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS expiry_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL UNIQUE,
      checked_by INTEGER NOT NULL,
      original_expiry TEXT,
      new_expiry TEXT,
      is_confirmed INTEGER DEFAULT 0,
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ===== PUSH ПОДПИСКИ =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ===== ТАБЛИЦА ИНСТРУКЦИЙ =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS instructions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT,
      file_path TEXT,
      category TEXT DEFAULT 'general',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Init sync status
  db.prepare(`INSERT OR IGNORE INTO sync_status (id) VALUES (1)`).run();

  console.log('Database initialized (ZAN 1.2)');
}

module.exports = { getDB, initDB };
