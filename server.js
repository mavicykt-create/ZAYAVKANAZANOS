import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { parseStringPromise } from 'xml2js';
import { fileURLToPath } from 'url';
import { all, get, initDb, run } from './src/db.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const PORT = Number(process.env.PORT || 3000);
const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), 'data');
const YML_URL = process.env.YML_URL || 'https://milku.ru/site1/export-yandex-YML/';
const LOCK_TTL_MS = Number(process.env.LOCK_TTL_MS || 2 * 60 * 1000);
const IMAGE_WIDTH = Number(process.env.IMAGE_WIDTH || 180);
const IMAGE_QUALITY = Number(process.env.IMAGE_QUALITY || 34);
const IMAGE_CACHE_VERSION = process.env.IMAGE_CACHE_VERSION || 'v5';
const IMAGE_CACHE_DIR = path.join(DB_DIR, `image-cache-${IMAGE_CACHE_VERSION}`);

const DEFAULT_ADMIN_LOGIN = process.env.DEFAULT_ADMIN_LOGIN || 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || '123456';
const DEFAULT_STAFF_LOGIN = process.env.DEFAULT_STAFF_LOGIN || 'staff';
const DEFAULT_STAFF_PASSWORD = process.env.DEFAULT_STAFF_PASSWORD || '123456';

const sessions = new Map();
let syncPromise = null;

const MODULES = {
  CARRY: 'carry',
  PRICE_CHECK: 'price_check',
};

const CATEGORIES = [
  { id: 54, name: 'Жидкие конфеты', sortOrder: 1 },
  { id: 57, name: 'Карамель, леденцы, шипучки', sortOrder: 2 },
  { id: 65, name: 'Шоколад', sortOrder: 3 },
  { id: 81, name: 'Пирожные, бисквиты, печенье', sortOrder: 4 },
  { id: 85, name: 'Мармелад, зефир, драже', sortOrder: 5 },
  { id: 92, name: 'Жевательная резинка', sortOrder: 6 },
  { id: 97, name: 'Жевательные конфеты', sortOrder: 7 },
  { id: 101, name: 'ЛЕТО26', sortOrder: 8 },
  { id: 105, name: 'Бакалея', sortOrder: 9 },
];

fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir));

function json(res, ok, data = {}, status = 200) {
  return res.status(status).json({ ok, ...data });
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function first(nodeValue, fallback = '') {
  if (Array.isArray(nodeValue)) return cleanText(nodeValue[0] ?? fallback);
  return cleanText(nodeValue ?? fallback);
}

function nowTs() {
  return Date.now();
}

function makeSessionToken() {
  return crypto.randomBytes(18).toString('hex');
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password ?? '')).digest('hex');
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    login: user.login,
    role: user.role,
    isActive: Number(user.is_active) === 1,
    createdAt: Number(user.created_at),
    updatedAt: Number(user.updated_at),
  };
}

function normalizeStatus(row, currentUser) {
  return {
    categoryId: Number(row.category_id),
    name: row.name,
    status: row.status,
    lockedBy: row.locked_by ? Number(row.locked_by) : null,
    lockedByLogin: row.locked_by_login || null,
    lockedAt: row.locked_at ? Number(row.locked_at) : null,
    completedAt: row.completed_at ? Number(row.completed_at) : null,
    isLockedByMe: Boolean(currentUser && row.locked_by && Number(row.locked_by) === Number(currentUser.id)),
  };
}

function getSessionUser(req) {
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const queryToken = typeof req.query?.token === 'string' ? req.query.token.trim() : '';
  const token = bearer || queryToken;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  session.lastSeenAt = nowTs();
  return session;
}

function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return json(res, false, { error: 'Требуется вход' }, 401);
  return get(`SELECT id, login, role, is_active FROM users WHERE id = ?`, [user.id])
    .then((dbUser) => {
      if (!dbUser) return json(res, false, { error: 'Сессия недействительна' }, 401);
      if (Number(dbUser.is_active) !== 1) return json(res, false, { error: 'Пользователь отключен' }, 403);
      user.login = dbUser.login;
      user.role = dbUser.role;
      user.is_active = Number(dbUser.is_active);
      req.sessionUser = user;
      return next();
    })
    .catch(next);
}

function requireAdmin(req, res, next) {
  if (req.sessionUser?.role !== 'admin') {
    return json(res, false, { error: 'Требуются права администратора' }, 403);
  }
  return next();
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function setAppState(key, value) {
  await run(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value ?? '')],
  );
}

async function getAppState(key, fallback = '') {
  const row = await get(`SELECT value FROM app_state WHERE key = ?`, [key]);
  return row?.value ?? fallback;
}

async function seedCategories() {
  for (const category of CATEGORIES) {
    await run(
      `INSERT OR IGNORE INTO catalog_categories (id, name, sort_order) VALUES (?, ?, ?)`,
      [category.id, category.name, category.sortOrder],
    );
  }
}

async function seedModuleCategoryState() {
  for (const moduleName of [MODULES.CARRY, MODULES.PRICE_CHECK]) {
    for (const category of CATEGORIES) {
      await run(
        `INSERT OR IGNORE INTO module_category_state (module, category_id, status)
         VALUES (?, ?, 'free')`,
        [moduleName, category.id],
      );
    }
  }
}

async function seedUsers() {
  const defaults = [
    { login: DEFAULT_ADMIN_LOGIN, password: DEFAULT_ADMIN_PASSWORD, role: 'admin' },
    { login: DEFAULT_STAFF_LOGIN, password: DEFAULT_STAFF_PASSWORD, role: 'staff' },
  ];
  for (const item of defaults) {
    const existing = await get(`SELECT id FROM users WHERE login = ?`, [item.login]);
    if (existing) continue;
    const ts = nowTs();
    await run(
      `INSERT INTO users (login, password_hash, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [item.login, hashPassword(item.password), item.role, ts, ts],
    );
  }
}

async function seedAppState() {
  const defaults = {
    catalog_synced_at: '',
    sync_running: '0',
    sync_progress: '0',
    sync_stage: 'idle',
    sync_message: '',
    sync_last_started_at: '',
    sync_last_finished_at: '',
    sync_total_offers: '0',
    sync_processed_offers: '0',
  };
  for (const [key, value] of Object.entries(defaults)) {
    await run(`INSERT OR IGNORE INTO app_state (key, value) VALUES (?, ?)`, [key, value]);
  }
}

async function getSyncState() {
  const rows = await all(
    `SELECT key, value FROM app_state
     WHERE key IN (
       'sync_running', 'sync_progress', 'sync_stage', 'sync_message',
       'sync_last_started_at', 'sync_last_finished_at',
       'sync_total_offers', 'sync_processed_offers'
     )`,
  );
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    running: map.sync_running === '1',
    progress: Number(map.sync_progress || 0),
    stage: map.sync_stage || 'idle',
    message: map.sync_message || '',
    lastStartedAt: Number(map.sync_last_started_at || 0) || null,
    lastFinishedAt: Number(map.sync_last_finished_at || 0) || null,
    totalOffers: Number(map.sync_total_offers || 0) || 0,
    processedOffers: Number(map.sync_processed_offers || 0) || 0,
  };
}

function nextSyncAllowedAt(sync) {
  const anchor = Number(sync?.lastStartedAt || sync?.lastFinishedAt || 0) || 0;
  return anchor ? anchor + 60 * 60 * 1000 : 0;
}

async function updateSyncProgress({ progress, stage, message, processedOffers, totalOffers }) {
  if (progress !== undefined) await setAppState('sync_progress', Math.max(0, Math.min(100, Math.round(progress))));
  if (stage !== undefined) await setAppState('sync_stage', stage);
  if (message !== undefined) await setAppState('sync_message', message);
  if (processedOffers !== undefined) await setAppState('sync_processed_offers', Math.max(0, Number(processedOffers) || 0));
  if (totalOffers !== undefined) await setAppState('sync_total_offers', Math.max(0, Number(totalOffers) || 0));
}

async function startSyncState() {
  await setAppState('sync_running', '1');
  await setAppState('sync_last_started_at', nowTs());
  await updateSyncProgress({
    progress: 0,
    stage: 'download',
    message: 'Начинаем загрузку каталога',
    processedOffers: 0,
    totalOffers: 0,
  });
}

async function finishSyncState(message = 'Каталог обновлён') {
  await setAppState('sync_running', '0');
  await setAppState('sync_last_finished_at', nowTs());
  await updateSyncProgress({ progress: 100, stage: 'done', message });
}

async function failSyncState(message = 'Ошибка обновления каталога') {
  await setAppState('sync_running', '0');
  await setAppState('sync_stage', 'error');
  await setAppState('sync_message', message);
}

async function releaseExpiredLocks() {
  const cutoff = nowTs() - LOCK_TTL_MS;
  await run(
    `UPDATE module_category_state
     SET status = 'free', locked_by = NULL, locked_at = NULL
     WHERE status = 'locked' AND locked_at IS NOT NULL AND locked_at < ?`,
    [cutoff],
  );
}

async function listModuleCategories(moduleName, currentUser = null) {
  await releaseExpiredLocks();
  const rows = await all(
    `SELECT m.module, m.category_id, m.status, m.locked_by, m.locked_at, m.completed_at,
            c.name, u.login AS locked_by_login
     FROM module_category_state m
     JOIN catalog_categories c ON c.id = m.category_id
     LEFT JOIN users u ON u.id = m.locked_by
     WHERE m.module = ?
     ORDER BY c.sort_order ASC, c.id ASC`,
    [moduleName],
  );
  return rows.map((row) => normalizeStatus(row, currentUser));
}

async function getModuleCategory(moduleName, categoryId) {
  return get(
    `SELECT m.*, c.name, u.login AS locked_by_login
     FROM module_category_state m
     JOIN catalog_categories c ON c.id = m.category_id
     LEFT JOIN users u ON u.id = m.locked_by
     WHERE m.module = ? AND m.category_id = ?`,
    [moduleName, Number(categoryId)],
  );
}

async function lockModuleCategory(moduleName, categoryId, user) {
  await releaseExpiredLocks();
  const row = await getModuleCategory(moduleName, categoryId);
  if (!row) {
    const error = new Error('Категория не найдена');
    error.status = 404;
    throw error;
  }
  if (row.status === 'completed') {
    const error = new Error('Категория уже завершена');
    error.status = 409;
    throw error;
  }
  if (row.status === 'locked' && Number(row.locked_by) !== Number(user.id)) {
    const error = new Error('Категория занята другим сотрудником');
    error.status = 409;
    throw error;
  }
  const ts = nowTs();
  const result = await run(
    `UPDATE module_category_state
     SET status = 'locked', locked_by = ?, locked_at = ?, completed_at = NULL
     WHERE module = ? AND category_id = ? AND (status = 'free' OR locked_by = ?)`,
    [user.id, ts, moduleName, Number(categoryId), user.id],
  );
  if (result.changes === 0) {
    const error = new Error('Категория занята другим сотрудником');
    error.status = 409;
    throw error;
  }
}

async function unlockModuleCategory(moduleName, categoryId, user) {
  const row = await getModuleCategory(moduleName, categoryId);
  if (!row) {
    const error = new Error('Категория не найдена');
    error.status = 404;
    throw error;
  }
  if (row.status !== 'locked') {
    const error = new Error('Категория не заблокирована');
    error.status = 400;
    throw error;
  }
  const isAdmin = user?.role === 'admin';
  const isOwner = Number(row.locked_by) === Number(user?.id);
  if (!isAdmin && !isOwner) {
    const error = new Error('Категория занята другим сотрудником');
    error.status = 403;
    throw error;
  }
  await run(
    `UPDATE module_category_state
     SET status = 'free', locked_by = NULL, locked_at = NULL
     WHERE module = ? AND category_id = ?`,
    [moduleName, Number(categoryId)],
  );
}

async function completeModuleCategory(moduleName, categoryId, user) {
  const row = await getModuleCategory(moduleName, categoryId);
  if (!row) {
    const error = new Error('Категория не найдена');
    error.status = 404;
    throw error;
  }
  if (row.status !== 'locked') {
    const error = new Error('Категория должна быть заблокирована перед подтверждением');
    error.status = 409;
    throw error;
  }
  if (Number(row.locked_by) !== Number(user.id)) {
    const error = new Error('Категория занята другим сотрудником');
    error.status = 409;
    throw error;
  }
  await run(
    `UPDATE module_category_state
     SET status = 'completed', locked_by = NULL, locked_at = NULL, completed_at = ?
     WHERE module = ? AND category_id = ?`,
    [nowTs(), moduleName, Number(categoryId)],
  );
}

async function heartbeatModuleCategory(moduleName, categoryId, user) {
  const result = await run(
    `UPDATE module_category_state
     SET locked_at = ?
     WHERE module = ? AND category_id = ? AND status = 'locked' AND locked_by = ?`,
    [nowTs(), moduleName, Number(categoryId), user.id],
  );
  if (result.changes === 0) {
    const error = new Error('Не удалось обновить блокировку');
    error.status = 409;
    throw error;
  }
}

async function getProductAndModuleCategory(moduleName, productId) {
  const product = await get(`SELECT id, category_id FROM catalog_products WHERE id = ?`, [Number(productId)]);
  if (!product) {
    const error = new Error('Товар не найден');
    error.status = 404;
    throw error;
  }
  const moduleCategory = await getModuleCategory(moduleName, Number(product.category_id));
  if (!moduleCategory) {
    const error = new Error('Категория не найдена');
    error.status = 404;
    throw error;
  }
  return { product, moduleCategory };
}

function assertCategoryEditingAccess(moduleCategory, user) {
  if (moduleCategory.status === 'completed') {
    const error = new Error('Категория уже завершена');
    error.status = 409;
    throw error;
  }
  if (moduleCategory.status !== 'locked') {
    const error = new Error('Сначала заблокируйте категорию');
    error.status = 409;
    throw error;
  }
  if (Number(moduleCategory.locked_by) !== Number(user.id)) {
    const error = new Error('Категория занята другим сотрудником');
    error.status = 409;
    throw error;
  }
}

function imageCachePath(url) {
  const key = `${IMAGE_CACHE_VERSION}|${IMAGE_WIDTH}|${IMAGE_QUALITY}|${url}`;
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  return path.join(IMAGE_CACHE_DIR, `${hash}.webp`);
}

async function ensureCompressedImage(url) {
  const cacheFile = imageCachePath(url);
  if (fs.existsSync(cacheFile)) return cacheFile;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'zan-1.1/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Не удалось скачать картинку: HTTP ${response.status}`);
    }
    const inputBuffer = Buffer.from(await response.arrayBuffer());
    const outputBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({
        width: IMAGE_WIDTH,
        height: IMAGE_WIDTH,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: IMAGE_QUALITY, effort: 6 })
      .toBuffer();
    fs.writeFileSync(cacheFile, outputBuffer);
    return cacheFile;
  } finally {
    clearTimeout(timeout);
  }
}

function clearImageCache() {
  if (!fs.existsSync(IMAGE_CACHE_DIR)) {
    fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
    return 0;
  }
  const entries = fs.readdirSync(IMAGE_CACHE_DIR, { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    const entryPath = path.join(IMAGE_CACHE_DIR, entry.name);
    if (entry.isDirectory()) fs.rmSync(entryPath, { recursive: true, force: true });
    else fs.unlinkSync(entryPath);
    removed += 1;
  }
  return removed;
}

async function syncCatalogFromYml() {
  await startSyncState();
  try {
    const response = await fetch(YML_URL, {
      headers: { 'User-Agent': 'zan-1.1/1.0' },
    });
    if (!response.ok) {
      throw new Error(`Не удалось скачать YML: HTTP ${response.status}`);
    }
    await updateSyncProgress({
      progress: 10,
      stage: 'download',
      message: 'YML загружен, разбираем каталог',
    });

    const xml = await response.text();
    const parsed = await parseStringPromise(xml, { explicitArray: true, trim: true });
    const offers = parsed?.yml_catalog?.shop?.[0]?.offers?.[0]?.offer || [];
    const categoryIds = new Set(CATEGORIES.map((item) => Number(item.id)));
    const validOffers = offers.filter((offer) => categoryIds.has(Number(first(offer.categoryId))));
    const total = validOffers.length;
    let processed = 0;

    await updateSyncProgress({
      progress: 18,
      stage: 'parse',
      message: 'Товары найдены, сохраняем в базу',
      processedOffers: 0,
      totalOffers: total,
    });

    for (const offer of validOffers) {
      const categoryId = Number(first(offer.categoryId));
      const name = first(offer.name);
      const vendorCode = first(offer.vendorCode);
      const picture = first(offer.picture);
      const description = first(offer.description);
      const priceRaw = first(offer.price, '0');
      const stockRaw = first(offer.stock_quantity) || first(offer.quantity) || '';
      const barcode = first(offer.barcode);
      const externalId = cleanText(offer?.$?.id || vendorCode);

      processed += 1;
      if (!name || !vendorCode) {
        continue;
      }

      const price = Number(String(priceRaw).replace(',', '.')) || 0;
      const stockQuantity = stockRaw === '' ? null : Number(stockRaw);
      await run(
        `INSERT INTO catalog_products (
           external_id, category_id, name, vendor_code, picture,
           price, description, barcode, stock_quantity, sort_order, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(category_id, vendor_code) DO UPDATE SET
           external_id = excluded.external_id,
           name = excluded.name,
           picture = excluded.picture,
           price = excluded.price,
           description = excluded.description,
           barcode = excluded.barcode,
           stock_quantity = excluded.stock_quantity,
           updated_at = excluded.updated_at`,
        [
          externalId,
          categoryId,
          name,
          vendorCode,
          picture,
          price,
          description,
          barcode,
          stockQuantity,
          0,
          nowTs(),
        ],
      );

      if (processed === total || processed % 25 === 0) {
        const progress = 18 + Math.round((processed / Math.max(total, 1)) * 76);
        await updateSyncProgress({
          progress,
          stage: 'save',
          message: `Сохранено товаров: ${processed} из ${total}`,
          processedOffers: processed,
          totalOffers: total,
        });
      }
    }

    await setAppState('catalog_synced_at', nowTs());
    await updateSyncProgress({
      progress: 98,
      stage: 'finish',
      message: 'Финальная подготовка каталога',
      processedOffers: processed,
      totalOffers: total,
    });
    await finishSyncState('Каталог полностью обновлён');
  } catch (error) {
    await failSyncState(error.message || 'Ошибка обновления каталога');
    throw error;
  }
}

async function buildCarryPickingPayload() {
  const rows = await all(
    `SELECT c.id AS category_id, c.name AS category_name,
            p.id AS product_id, p.name AS product_name, p.vendor_code,
            p.picture, COALESCE(i.qty, 0) AS qty, COALESCE(i.picked, 0) AS picked
     FROM carry_order_items i
     JOIN catalog_products p ON p.id = i.product_id
     JOIN catalog_categories c ON c.id = p.category_id
     WHERE i.qty > 0
     ORDER BY c.sort_order ASC, c.id ASC, p.name COLLATE NOCASE ASC`,
  );

  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.category_id)) {
      groups.set(row.category_id, {
        categoryId: Number(row.category_id),
        categoryName: row.category_name,
        items: [],
      });
    }
    groups.get(row.category_id).items.push({
      productId: Number(row.product_id),
      name: row.product_name,
      vendorCode: row.vendor_code,
      picture: row.picture || '',
      qty: Number(row.qty),
      picked: Number(row.picked) === 1,
    });
  }

  const categories = Array.from(groups.values());
  const totalItems = categories.reduce((sum, category) => sum + category.items.length, 0);
  const pickedItems = categories.reduce(
    (sum, category) => sum + category.items.filter((item) => item.picked).length,
    0,
  );

  return {
    generatedAt: nowTs(),
    categories,
    totalItems,
    pickedItems,
    allPicked: totalItems > 0 && pickedItems === totalItems,
  };
}

async function buildPriceCheckReportPayload() {
  const rows = await all(
    `SELECT c.id AS category_id, c.name AS category_name,
            p.id AS product_id, p.name AS product_name, p.vendor_code, p.picture,
            COALESCE(i.no_stock, 0) AS no_stock,
            COALESCE(i.no_price_tag, 0) AS no_price_tag
     FROM price_check_items i
     JOIN catalog_products p ON p.id = i.product_id
     JOIN catalog_categories c ON c.id = p.category_id
     WHERE COALESCE(i.no_stock, 0) = 1 OR COALESCE(i.no_price_tag, 0) = 1
     ORDER BY c.sort_order ASC, c.id ASC, p.name COLLATE NOCASE ASC`,
  );

  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.category_id)) {
      groups.set(row.category_id, {
        categoryId: Number(row.category_id),
        categoryName: row.category_name,
        items: [],
      });
    }
    groups.get(row.category_id).items.push({
      productId: Number(row.product_id),
      name: row.product_name,
      vendorCode: row.vendor_code,
      picture: row.picture || '',
      noStock: Number(row.no_stock) === 1,
      noPriceTag: Number(row.no_price_tag) === 1,
    });
  }

  return {
    generatedAt: nowTs(),
    categories: Array.from(groups.values()),
  };
}

async function getStatePayload(user) {
  const [carryCategories, priceCheckCategories, sync] = await Promise.all([
    listModuleCategories(MODULES.CARRY, user),
    listModuleCategories(MODULES.PRICE_CHECK, user),
    getSyncState(),
  ]);
  const syncedAtRaw = await getAppState('catalog_synced_at', '');
  const canOpenPicking = carryCategories.length > 0 && carryCategories.every((item) => item.status === 'completed');
  return {
    role: user.role,
    user: { id: Number(user.id), login: user.login, role: user.role },
    carryCategories,
    priceCheckCategories,
    canOpenPicking,
    syncedAt: Number(syncedAtRaw || 0) || null,
    sync: {
      ...sync,
      nextAllowedAt: nextSyncAllowedAt(sync),
    },
    imageSettings: {
      width: IMAGE_WIDTH,
      quality: IMAGE_QUALITY,
      cacheVersion: IMAGE_CACHE_VERSION,
    },
  };
}

app.post(
  '/api/login',
  asyncHandler(async (req, res) => {
    const login = cleanText(req.body?.login);
    const password = cleanText(req.body?.password);
    if (!login || !password) {
      return json(res, false, { error: 'Логин и пароль обязательны' }, 400);
    }

    const user = await get(
      `SELECT id, login, password_hash, role, is_active FROM users WHERE login = ?`,
      [login],
    );
    if (!user || user.password_hash !== hashPassword(password)) {
      return json(res, false, { error: 'Неверный логин или пароль' }, 401);
    }
    if (Number(user.is_active) !== 1) {
      return json(res, false, { error: 'Пользователь отключен' }, 403);
    }

    const token = makeSessionToken();
    sessions.set(token, {
      token,
      id: Number(user.id),
      login: user.login,
      role: user.role,
      is_active: Number(user.is_active),
      createdAt: nowTs(),
      lastSeenAt: nowTs(),
    });

    return json(res, true, {
      token,
      role: user.role,
      user: { id: Number(user.id), login: user.login, role: user.role },
    });
  }),
);

app.post('/api/logout', requireAuth, (req, res) => {
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (bearer) sessions.delete(bearer);
  return json(res, true, { message: 'Вы вышли из системы' });
});

app.get('/api/me', requireAuth, (req, res) => {
  return json(res, true, {
    user: {
      id: Number(req.sessionUser.id),
      login: req.sessionUser.login,
      role: req.sessionUser.role,
    },
  });
});

app.get(
  '/api/state',
  requireAuth,
  asyncHandler(async (req, res) => {
    const state = await getStatePayload(req.sessionUser);
    return json(res, true, { state });
  }),
);

app.get(
  '/api/sync-status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sync = await getSyncState();
    return json(res, true, {
      sync: {
        ...sync,
        nextAllowedAt: nextSyncAllowedAt(sync),
      },
    });
  }),
);

app.post(
  '/api/sync-yml',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sync = await getSyncState();
    if (sync.running || syncPromise) {
      return json(res, false, { error: 'Обновление каталога уже выполняется' }, 409);
    }
    const allowedAt = nextSyncAllowedAt(sync);
    if (allowedAt && nowTs() < allowedAt) {
      const waitMinutes = Math.ceil((allowedAt - nowTs()) / 60000);
      return json(
        res,
        false,
        {
          error: `Каталог можно обновлять только 1 раз в час. Подождите ещё ${waitMinutes} мин.`,
          nextAllowedAt: allowedAt,
        },
        429,
      );
    }

    syncPromise = syncCatalogFromYml().finally(() => {
      syncPromise = null;
    });
    return json(res, true, { message: 'Обновление каталога запущено' });
  }),
);

app.post(
  '/api/sync-reset',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    syncPromise = null;
    await setAppState('sync_running', '0');
    await setAppState('sync_progress', '0');
    await setAppState('sync_stage', 'idle');
    await setAppState('sync_message', 'Обновление каталога сброшено вручную');
    await setAppState('sync_total_offers', '0');
    await setAppState('sync_processed_offers', '0');
    return json(res, true, { message: 'Состояние обновления каталога сброшено' });
  }),
);

app.get(
  '/api/image',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sourceUrl = cleanText(req.query?.url);
    if (!sourceUrl) return json(res, false, { error: 'Не передан URL картинки' }, 400);
    if (!/^https?:\/\//i.test(sourceUrl)) return json(res, false, { error: 'Неверный URL картинки' }, 400);
    const filePath = await ensureCompressedImage(sourceUrl);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(filePath);
  }),
);

app.get(
  '/api/carry/categories',
  requireAuth,
  asyncHandler(async (req, res) => {
    const categories = await listModuleCategories(MODULES.CARRY, req.sessionUser);
    return json(res, true, { categories });
  }),
);

app.post(
  '/api/carry/categories/:id/lock',
  requireAuth,
  asyncHandler(async (req, res) => {
    await lockModuleCategory(MODULES.CARRY, req.params.id, req.sessionUser);
    const categories = await listModuleCategories(MODULES.CARRY, req.sessionUser);
    return json(res, true, { categories });
  }),
);

app.post(
  '/api/carry/categories/:id/unlock',
  requireAuth,
  asyncHandler(async (req, res) => {
    await unlockModuleCategory(MODULES.CARRY, req.params.id, req.sessionUser);
    const categories = await listModuleCategories(MODULES.CARRY, req.sessionUser);
    return json(res, true, { categories, message: 'Категория разблокирована' });
  }),
);

app.post(
  '/api/carry/categories/:id/heartbeat',
  requireAuth,
  asyncHandler(async (req, res) => {
    await heartbeatModuleCategory(MODULES.CARRY, req.params.id, req.sessionUser);
    return json(res, true, { message: 'Heartbeat updated' });
  }),
);

app.post(
  '/api/carry/categories/:id/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    await completeModuleCategory(MODULES.CARRY, req.params.id, req.sessionUser);
    const categories = await listModuleCategories(MODULES.CARRY, req.sessionUser);
    return json(res, true, { categories, message: 'Категория подтверждена' });
  }),
);

app.get(
  '/api/carry/category/:id/products',
  requireAuth,
  asyncHandler(async (req, res) => {
    const categoryId = Number(req.params.id);
    const category = await get(`SELECT id, name FROM catalog_categories WHERE id = ?`, [categoryId]);
    if (!category) return json(res, false, { error: 'Категория не найдена' }, 404);
    const moduleCategory = await getModuleCategory(MODULES.CARRY, categoryId);
    if (!moduleCategory) return json(res, false, { error: 'Категория не найдена' }, 404);
    assertCategoryEditingAccess(moduleCategory, req.sessionUser);
    const products = await all(
      `SELECT p.id, p.category_id AS categoryId, p.name, p.vendor_code AS vendorCode,
              p.picture, p.barcode, COALESCE(i.qty, 0) AS qty, COALESCE(i.picked, 0) AS picked
       FROM catalog_products p
       LEFT JOIN carry_order_items i ON i.product_id = p.id
       WHERE p.category_id = ?
       ORDER BY p.sort_order ASC, p.name COLLATE NOCASE ASC`,
      [categoryId],
    );
    return json(res, true, {
      category: { id: Number(category.id), name: category.name },
      products: products.map((item) => ({
        id: Number(item.id),
        categoryId: Number(item.categoryId),
        name: item.name,
        vendorCode: item.vendorCode,
        picture: item.picture || '',
        barcode: item.barcode || '',
        qty: Number(item.qty || 0),
        picked: Number(item.picked || 0) === 1,
      })),
    });
  }),
);

app.post(
  '/api/carry/items/:id/increment',
  requireAuth,
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.id);
    const { moduleCategory } = await getProductAndModuleCategory(MODULES.CARRY, productId);
    assertCategoryEditingAccess(moduleCategory, req.sessionUser);
    await run(
      `INSERT INTO carry_order_items (product_id, qty, picked, updated_at)
       VALUES (?, 1, 0, ?)
       ON CONFLICT(product_id) DO UPDATE SET
         qty = qty + 1,
         picked = 0,
         updated_at = excluded.updated_at`,
      [productId, nowTs()],
    );
    return json(res, true, { message: 'Количество увеличено' });
  }),
);

app.post(
  '/api/carry/items/:id/decrement',
  requireAuth,
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.id);
    const { moduleCategory } = await getProductAndModuleCategory(MODULES.CARRY, productId);
    assertCategoryEditingAccess(moduleCategory, req.sessionUser);
    const row = await get(`SELECT qty FROM carry_order_items WHERE product_id = ?`, [productId]);
    if (!row) return json(res, true, { message: 'Количество уже 0' });
    const nextQty = Math.max(0, Number(row.qty) - 1);
    if (nextQty === 0) {
      await run(`DELETE FROM carry_order_items WHERE product_id = ?`, [productId]);
    } else {
      await run(
        `UPDATE carry_order_items
         SET qty = ?, picked = 0, updated_at = ?
         WHERE product_id = ?`,
        [nextQty, nowTs(), productId],
      );
    }
    return json(res, true, { message: 'Количество уменьшено' });
  }),
);

app.get(
  '/api/carry/picking',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = await buildCarryPickingPayload();
    return json(res, true, payload);
  }),
);

app.post(
  '/api/carry/items/:id/toggle-picked',
  requireAuth,
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.id);
    const row = await get(`SELECT qty, picked FROM carry_order_items WHERE product_id = ?`, [productId]);
    if (!row || Number(row.qty) <= 0) return json(res, false, { error: 'Товар не в заявке' }, 400);
    const nextPicked = Number(row.picked) === 1 ? 0 : 1;
    await run(
      `UPDATE carry_order_items
       SET picked = ?, updated_at = ?
       WHERE product_id = ?`,
      [nextPicked, nowTs(), productId],
    );
    return json(res, true, { picked: nextPicked === 1 });
  }),
);

app.post(
  '/api/carry/complete-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await run(`DELETE FROM carry_order_items`);
    await run(
      `UPDATE module_category_state
       SET status = 'free', locked_by = NULL, locked_at = NULL, completed_at = NULL
       WHERE module = ?`,
      [MODULES.CARRY],
    );
    return json(res, true, { message: 'Заявка собрана полностью' });
  }),
);

app.post(
  '/api/carry/reset',
  requireAuth,
  asyncHandler(async (req, res) => {
    await run(`DELETE FROM carry_order_items`);
    await run(
      `UPDATE module_category_state
       SET status = 'free', locked_by = NULL, locked_at = NULL, completed_at = NULL
       WHERE module = ?`,
      [MODULES.CARRY],
    );
    return json(res, true, { message: 'Модуль заявка на занос сброшен' });
  }),
);

app.get(
  '/api/carry/print',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = await buildCarryPickingPayload();
    return json(res, true, payload);
  }),
);

app.get(
  '/api/price-check/categories',
  requireAuth,
  asyncHandler(async (req, res) => {
    const categories = await listModuleCategories(MODULES.PRICE_CHECK, req.sessionUser);
    return json(res, true, { categories });
  }),
);

app.post(
  '/api/price-check/categories/:id/lock',
  requireAuth,
  asyncHandler(async (req, res) => {
    await lockModuleCategory(MODULES.PRICE_CHECK, req.params.id, req.sessionUser);
    const categories = await listModuleCategories(MODULES.PRICE_CHECK, req.sessionUser);
    return json(res, true, { categories });
  }),
);

app.post(
  '/api/price-check/categories/:id/unlock',
  requireAuth,
  asyncHandler(async (req, res) => {
    await unlockModuleCategory(MODULES.PRICE_CHECK, req.params.id, req.sessionUser);
    const categories = await listModuleCategories(MODULES.PRICE_CHECK, req.sessionUser);
    return json(res, true, { categories, message: 'Категория разблокирована' });
  }),
);

app.post(
  '/api/price-check/categories/:id/heartbeat',
  requireAuth,
  asyncHandler(async (req, res) => {
    await heartbeatModuleCategory(MODULES.PRICE_CHECK, req.params.id, req.sessionUser);
    return json(res, true, { message: 'Heartbeat updated' });
  }),
);

app.post(
  '/api/price-check/categories/:id/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    await completeModuleCategory(MODULES.PRICE_CHECK, req.params.id, req.sessionUser);
    const categories = await listModuleCategories(MODULES.PRICE_CHECK, req.sessionUser);
    return json(res, true, { categories, message: 'Проверка категории подтверждена' });
  }),
);

app.get(
  '/api/price-check/category/:id/products',
  requireAuth,
  asyncHandler(async (req, res) => {
    const categoryId = Number(req.params.id);
    const category = await get(`SELECT id, name FROM catalog_categories WHERE id = ?`, [categoryId]);
    if (!category) return json(res, false, { error: 'Категория не найдена' }, 404);
    const moduleCategory = await getModuleCategory(MODULES.PRICE_CHECK, categoryId);
    if (!moduleCategory) return json(res, false, { error: 'Категория не найдена' }, 404);
    assertCategoryEditingAccess(moduleCategory, req.sessionUser);
    const products = await all(
      `SELECT p.id, p.category_id AS categoryId, p.name, p.vendor_code AS vendorCode,
              p.picture, COALESCE(i.no_stock, 0) AS noStock,
              COALESCE(i.no_price_tag, 0) AS noPriceTag
       FROM catalog_products p
       LEFT JOIN price_check_items i ON i.product_id = p.id
       WHERE p.category_id = ?
       ORDER BY p.sort_order ASC, p.name COLLATE NOCASE ASC`,
      [categoryId],
    );
    return json(res, true, {
      category: { id: Number(category.id), name: category.name },
      products: products.map((item) => ({
        id: Number(item.id),
        categoryId: Number(item.categoryId),
        name: item.name,
        vendorCode: item.vendorCode,
        picture: item.picture || '',
        noStock: Number(item.noStock) === 1,
        noPriceTag: Number(item.noPriceTag) === 1,
      })),
    });
  }),
);

async function togglePriceCheckField(productId, field, userId) {
  const current = await get(
    `SELECT no_stock, no_price_tag FROM price_check_items WHERE product_id = ?`,
    [productId],
  );
  const next = {
    no_stock: Number(current?.no_stock || 0),
    no_price_tag: Number(current?.no_price_tag || 0),
  };
  next[field] = next[field] === 1 ? 0 : 1;

  if (next.no_stock === 0 && next.no_price_tag === 0) {
    await run(`DELETE FROM price_check_items WHERE product_id = ?`, [productId]);
    return next;
  }

  await run(
    `INSERT INTO price_check_items (product_id, no_stock, no_price_tag, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(product_id) DO UPDATE SET
       no_stock = excluded.no_stock,
       no_price_tag = excluded.no_price_tag,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
    [productId, next.no_stock, next.no_price_tag, userId, nowTs()],
  );
  return next;
}

app.post(
  '/api/price-check/items/:id/toggle-no-stock',
  requireAuth,
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.id);
    const { moduleCategory } = await getProductAndModuleCategory(MODULES.PRICE_CHECK, productId);
    assertCategoryEditingAccess(moduleCategory, req.sessionUser);
    const state = await togglePriceCheckField(productId, 'no_stock', req.sessionUser.id);
    return json(res, true, {
      noStock: state.no_stock === 1,
      noPriceTag: state.no_price_tag === 1,
    });
  }),
);

app.post(
  '/api/price-check/items/:id/toggle-no-price-tag',
  requireAuth,
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.id);
    const { moduleCategory } = await getProductAndModuleCategory(MODULES.PRICE_CHECK, productId);
    assertCategoryEditingAccess(moduleCategory, req.sessionUser);
    const state = await togglePriceCheckField(productId, 'no_price_tag', req.sessionUser.id);
    return json(res, true, {
      noStock: state.no_stock === 1,
      noPriceTag: state.no_price_tag === 1,
    });
  }),
);

app.get(
  '/api/price-check/report',
  requireAuth,
  asyncHandler(async (req, res) => {
    const report = await buildPriceCheckReportPayload();
    return json(res, true, report);
  }),
);

app.get(
  '/api/price-check/print',
  requireAuth,
  asyncHandler(async (req, res) => {
    const report = await buildPriceCheckReportPayload();
    return json(res, true, report);
  }),
);

app.get(
  '/api/product-check/no-barcode',
  requireAuth,
  asyncHandler(async (req, res) => {
    const products = await all(
      `SELECT p.id, p.name, p.vendor_code AS vendorCode, p.picture, p.barcode,
              c.id AS categoryId, c.name AS categoryName
       FROM catalog_products p
       JOIN catalog_categories c ON c.id = p.category_id
       WHERE p.barcode IS NULL OR TRIM(p.barcode) = ''
       ORDER BY c.sort_order ASC, c.id ASC, p.name COLLATE NOCASE ASC`,
    );
    return json(res, true, {
      products: products.map((item) => ({
        id: Number(item.id),
        name: item.name,
        vendorCode: item.vendorCode,
        picture: item.picture || '',
        barcode: item.barcode || '',
        categoryId: Number(item.categoryId),
        categoryName: item.categoryName,
      })),
    });
  }),
);

app.get(
  '/api/admin/users',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const users = await all(
      `SELECT id, login, role, is_active, created_at, updated_at
       FROM users
       ORDER BY id ASC`,
    );
    return json(res, true, { users: users.map(sanitizeUser) });
  }),
);

app.post(
  '/api/admin/users',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const login = cleanText(req.body?.login);
    const password = cleanText(req.body?.password);
    const role = cleanText(req.body?.role || 'staff');

    if (!login || !password) return json(res, false, { error: 'Логин и пароль обязательны' }, 400);
    if (!['admin', 'staff'].includes(role)) return json(res, false, { error: 'Неверная роль' }, 400);

    const exists = await get(`SELECT id FROM users WHERE login = ?`, [login]);
    if (exists) return json(res, false, { error: 'Логин уже существует' }, 409);

    const ts = nowTs();
    await run(
      `INSERT INTO users (login, password_hash, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [login, hashPassword(password), role, ts, ts],
    );
    return json(res, true, { message: 'Пользователь создан' });
  }),
);

app.patch(
  '/api/admin/users/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    const user = await get(`SELECT * FROM users WHERE id = ?`, [userId]);
    if (!user) return json(res, false, { error: 'Пользователь не найден' }, 404);

    const nextLogin = req.body?.login !== undefined ? cleanText(req.body.login) : user.login;
    const nextRole = req.body?.role !== undefined ? cleanText(req.body.role) : user.role;
    const nextActive =
      req.body?.is_active !== undefined ? (Number(req.body.is_active) === 1 ? 1 : 0) : Number(user.is_active);
    const nextPasswordHash = cleanText(req.body?.password)
      ? hashPassword(cleanText(req.body.password))
      : user.password_hash;

    if (!nextLogin) return json(res, false, { error: 'Логин не может быть пустым' }, 400);
    if (!['admin', 'staff'].includes(nextRole)) return json(res, false, { error: 'Неверная роль' }, 400);
    const dup = await get(`SELECT id FROM users WHERE login = ? AND id != ?`, [nextLogin, userId]);
    if (dup) return json(res, false, { error: 'Логин уже занят' }, 409);

    await run(
      `UPDATE users
       SET login = ?, role = ?, is_active = ?, password_hash = ?, updated_at = ?
       WHERE id = ?`,
      [nextLogin, nextRole, nextActive, nextPasswordHash, nowTs(), userId],
    );
    return json(res, true, { message: 'Пользователь обновлён' });
  }),
);

app.post(
  '/api/admin/users/:id/toggle-active',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    const user = await get(`SELECT id, is_active FROM users WHERE id = ?`, [userId]);
    if (!user) return json(res, false, { error: 'Пользователь не найден' }, 404);
    const next = Number(user.is_active) === 1 ? 0 : 1;
    await run(`UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?`, [next, nowTs(), userId]);
    return json(res, true, { message: next === 1 ? 'Пользователь включен' : 'Пользователь отключен' });
  }),
);

app.get(
  '/api/admin/locks',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const locks = await all(
      `SELECT m.module, m.category_id AS categoryId, c.name AS categoryName,
              m.locked_by AS lockedBy, m.locked_at AS lockedAt, u.login AS lockedByLogin
       FROM module_category_state m
       JOIN catalog_categories c ON c.id = m.category_id
       LEFT JOIN users u ON u.id = m.locked_by
       WHERE m.status = 'locked'
       ORDER BY m.locked_at ASC`,
    );
    return json(res, true, {
      locks: locks.map((item) => ({
        module: item.module,
        categoryId: Number(item.categoryId),
        categoryName: item.categoryName,
        lockedBy: item.lockedBy ? Number(item.lockedBy) : null,
        lockedByLogin: item.lockedByLogin || null,
        lockedAt: item.lockedAt ? Number(item.lockedAt) : null,
      })),
    });
  }),
);

app.post(
  '/api/admin/unlock-category',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const moduleName = cleanText(req.body?.module);
    const categoryId = Number(req.body?.categoryId);
    if (![MODULES.CARRY, MODULES.PRICE_CHECK].includes(moduleName)) {
      return json(res, false, { error: 'Неверный модуль' }, 400);
    }
    if (!Number.isFinite(categoryId)) {
      return json(res, false, { error: 'Неверная категория' }, 400);
    }
    await run(
      `UPDATE module_category_state
       SET status = 'free', locked_by = NULL, locked_at = NULL
       WHERE module = ? AND category_id = ?`,
      [moduleName, categoryId],
    );
    return json(res, true, { message: 'Категория разблокирована вручную' });
  }),
);

app.post(
  '/api/admin/clear-image-cache',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const removed = clearImageCache();
    return json(res, true, { message: `Кэш изображений очищен (${removed})` });
  }),
);

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((error, req, res, next) => {
  const status = Number(error?.status) || 500;
  const message = error?.message || 'Внутренняя ошибка сервера';
  if (status >= 500) {
    console.error('Unhandled error:', error);
  }
  if (res.headersSent) return next(error);
  return json(res, false, { error: message }, status);
});

async function start() {
  await initDb();
  await seedCategories();
  await seedModuleCategoryState();
  await seedUsers();
  await seedAppState();

  app.listen(PORT, () => {
    console.log(`ZAN 1.1 server started on :${PORT}`);
  });
}

start().catch((error) => {
  console.error('Startup error:', error);
  process.exit(1);
});
