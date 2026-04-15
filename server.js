import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { parseStringPromise } from 'xml2js';
import sharp from 'sharp';
import { initDb, run, get, all } from './src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const YML_URL = process.env.YML_URL || 'https://milku.ru/site1/export-yandex-YML/';
const LOGIN = process.env.APP_LOGIN || 'user';
const PASSWORD = process.env.APP_PASSWORD || '7895123';
const LOCK_TTL_MS = Number(process.env.LOCK_TTL_MS || 2 * 60 * 1000);
const IMAGE_WIDTH = Number(process.env.IMAGE_WIDTH || 320);
const IMAGE_QUALITY = Number(process.env.IMAGE_QUALITY || 42);
const IMAGE_CACHE_DIR = process.env.IMAGE_CACHE_DIR || '/data/image-cache';

const sessions = new Map();
fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });

const CATEGORIES = {
  54: 'Жидкие конфеты',
  57: 'Карамель, леденцы, шипучки',
  65: 'Шоколад',
  81: 'Пирожные, бисквиты, печенье',
  85: 'Мармелад, зефир, драже',
  92: 'Жевательная резинка',
  97: 'Жевательные конфеты',
  101: 'ЛЕТО26',
  105: 'Бакалея'
};

app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir));

function json(res, ok, data = {}, status = 200) {
  return res.status(status).json({ ok, ...data });
}

function makeSession() {
  return crypto.randomBytes(18).toString('hex');
}

function getSessionUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  session.lastSeenAt = Date.now();
  return session;
}

function requireAuth(req, res, next) {
  const session = getSessionUser(req);
  if (!session) return json(res, false, { error: 'Требуется вход' }, 401);
  req.sessionUser = session;
  next();
}

async function seedCategories() {
  for (const [id, name] of Object.entries(CATEGORIES)) {
    await run(`INSERT OR IGNORE INTO catalog_categories (id, name, sort_order) VALUES (?, ?, ?)`, [Number(id), name, Number(id)]);
    await run(`INSERT OR IGNORE INTO active_order_categories (category_id, status) VALUES (?, 'open')`, [Number(id)]);
  }

  await run(`INSERT OR IGNORE INTO app_state (key, value) VALUES ('catalog_synced_at', '')`);
}

async function releaseExpiredLocks() {
  const cutoff = Date.now() - LOCK_TTL_MS;
  await run(
    `UPDATE active_order_categories
     SET status = 'open', locked_by = NULL, locked_at = NULL
     WHERE status = 'locked' AND locked_at IS NOT NULL AND locked_at < ?`,
    [cutoff]
  );
}

function cleanText(value) {
  return String(value || '').trim();
}

function first(nodeValue, fallback = '') {
  if (Array.isArray(nodeValue)) return cleanText(nodeValue[0] ?? fallback);
  return cleanText(nodeValue ?? fallback);
}

function imageCachePath(url) {
  const hash = crypto.createHash('sha1').update(url).digest('hex');
  return path.join(IMAGE_CACHE_DIR, `${hash}.webp`);
}

async function ensureCompressedImage(url) {
  const cacheFile = imageCachePath(url);
  if (fs.existsSync(cacheFile)) return cacheFile;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'warehouse-order-app/1.1' }
  });

  if (!response.ok) {
    throw new Error(`Не удалось скачать картинку: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  const outputBuffer = await sharp(inputBuffer)
    .rotate()
    .resize({ width: IMAGE_WIDTH, height: IMAGE_WIDTH, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: IMAGE_QUALITY, effort: 6 })
    .toBuffer();

  fs.writeFileSync(cacheFile, outputBuffer);
  return cacheFile;
}

async function syncCatalogFromYml() {
  const response = await fetch(YML_URL, {
    headers: { 'User-Agent': 'warehouse-order-app/1.1' }
  });

  if (!response.ok) {
    throw new Error(`Не удалось скачать YML: HTTP ${response.status}`);
  }

  const xml = await response.text();
  const parsed = await parseStringPromise(xml, {
    explicitArray: true,
    mergeAttrs: false,
    trim: true
  });

  const offers = parsed?.yml_catalog?.shop?.[0]?.offers?.[0]?.offer || [];

  for (const offer of offers) {
    const categoryId = Number(first(offer.categoryId));
    if (!CATEGORIES[categoryId]) continue;

    const name = first(offer.name);
    const vendorCode = first(offer.vendorCode);
    const picture = first(offer.picture);
    const description = first(offer.description);
    const priceRaw = first(offer.price, '0');
    const stockRaw = first(offer.stock_quantity) || first(offer.quantity) || '';
    const externalId = cleanText(offer?.$?.id || vendorCode);

    if (!name || !vendorCode) continue;

    const price = Number(priceRaw.replace(',', '.')) || 0;
    const stockQuantity = stockRaw === '' ? null : Number(stockRaw);

    await run(
      `INSERT INTO catalog_products (
         external_id, category_id, name, vendor_code, picture, price, description, stock_quantity, sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(category_id, vendor_code) DO UPDATE SET
         external_id = excluded.external_id,
         name = excluded.name,
         picture = excluded.picture,
         price = excluded.price,
         description = excluded.description,
         stock_quantity = excluded.stock_quantity`,
      [externalId, categoryId, name, vendorCode, picture, price, description, stockQuantity, 0]
    );
  }

  await run(`UPDATE app_state SET value = ? WHERE key = 'catalog_synced_at'`, [String(Date.now())]);
}

async function getFullState() {
  await releaseExpiredLocks();

  const categories = await all(
    `SELECT c.id, c.name, a.status, a.locked_by, a.locked_at, a.completed_at
     FROM catalog_categories c
     JOIN active_order_categories a ON a.category_id = c.id
     ORDER BY c.sort_order ASC, c.id ASC`
  );

  const products = await all(
    `SELECT p.id, p.category_id, p.name, p.vendor_code, p.picture, p.price, p.stock_quantity,
            COALESCE(i.qty, 0) AS qty,
            COALESCE(i.picked, 0) AS picked
     FROM catalog_products p
     LEFT JOIN active_order_items i ON i.product_id = p.id
     ORDER BY p.category_id ASC, p.name COLLATE NOCASE ASC`
  );

  const synced = await get(`SELECT value FROM app_state WHERE key = 'catalog_synced_at'`);

  const byCategory = {};
  for (const category of categories) byCategory[category.id] = [];
  for (const product of products) {
    if (!byCategory[product.category_id]) byCategory[product.category_id] = [];
    byCategory[product.category_id].push(product);
  }

  const allDone = categories.length > 0 && categories.every((c) => c.status === 'completed');
  const orderedItems = products.filter((p) => p.qty > 0);
  const allPicked = orderedItems.length > 0 && orderedItems.every((p) => Number(p.picked) === 1);

  return {
    categories,
    productsByCategory: byCategory,
    canOpenPicking: allDone,
    allPicked,
    syncedAt: Number(synced?.value || 0) || null,
    imageSettings: {
      width: IMAGE_WIDTH,
      quality: IMAGE_QUALITY
    }
  };
}

app.post('/api/login', async (req, res) => {
  const { login, password } = req.body || {};
  if (login !== LOGIN || password !== PASSWORD) {
    return json(res, false, { error: 'Неверный логин или пароль' }, 401);
  }

  const token = makeSession();
  sessions.set(token, {
    token,
    login,
    userId: `user-${crypto.randomBytes(4).toString('hex')}`,
    createdAt: Date.now(),
    lastSeenAt: Date.now()
  });

  return json(res, true, { token });
});

app.get('/api/image', requireAuth, async (req, res) => {
  try {
    const sourceUrl = cleanText(req.query.url);
    if (!sourceUrl) return json(res, false, { error: 'Не передан URL картинки' }, 400);
    const filePath = await ensureCompressedImage(sourceUrl);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(filePath);
  } catch (error) {
    return json(res, false, { error: `Ошибка обработки картинки: ${error.message}` }, 500);
  }
});

app.get('/api/state', requireAuth, async (req, res) => {
  const state = await getFullState();
  return json(res, true, { state });
});

app.post('/api/sync-yml', requireAuth, async (req, res) => {
  try {
    await syncCatalogFromYml();
    const state = await getFullState();
    return json(res, true, { message: 'Каталог обновлён из YML', state });
  } catch (error) {
    return json(res, false, { error: error.message }, 500);
  }
});

app.post('/api/categories/:id/lock', requireAuth, async (req, res) => {
  const categoryId = Number(req.params.id);
  await releaseExpiredLocks();
  const row = await get(`SELECT * FROM active_order_categories WHERE category_id = ?`, [categoryId]);
  if (!row) return json(res, false, { error: 'Категория не найдена' }, 404);
  if (row.status === 'completed') return json(res, false, { error: 'Категория уже завершена' }, 400);
  if (row.status === 'locked' && row.locked_by !== req.sessionUser.userId) {
    return json(res, false, { error: 'Категория занята другим сотрудником' }, 409);
  }

  await run(
    `UPDATE active_order_categories SET status = 'locked', locked_by = ?, locked_at = ?, completed_at = NULL WHERE category_id = ?`,
    [req.sessionUser.userId, Date.now(), categoryId]
  );

  const state = await getFullState();
  return json(res, true, { state });
});

app.post('/api/categories/:id/unlock', requireAuth, async (req, res) => {
  const categoryId = Number(req.params.id);
  const row = await get(`SELECT * FROM active_order_categories WHERE category_id = ?`, [categoryId]);
  if (!row) return json(res, false, { error: 'Категория не найдена' }, 404);
  if (row.status !== 'locked') return json(res, false, { error: 'Категория сейчас не заблокирована' }, 400);

  await run(
    `UPDATE active_order_categories
     SET status = 'open', locked_by = NULL, locked_at = NULL
     WHERE category_id = ?`,
    [categoryId]
  );

  const state = await getFullState();
  return json(res, true, { state, message: 'Категория разблокирована вручную' });
});

app.post('/api/categories/:id/heartbeat', requireAuth, async (req, res) => {
  const categoryId = Number(req.params.id);
  await run(
    `UPDATE active_order_categories SET locked_at = ? WHERE category_id = ? AND locked_by = ? AND status = 'locked'`,
    [Date.now(), categoryId, req.sessionUser.userId]
  );
  return json(res, true, { message: 'Heartbeat updated' });
});

app.post('/api/categories/:id/complete', requireAuth, async (req, res) => {
  const categoryId = Number(req.params.id);
  const row = await get(`SELECT * FROM active_order_categories WHERE category_id = ?`, [categoryId]);
  if (!row) return json(res, false, { error: 'Категория не найдена' }, 404);
  if (row.status === 'locked' && row.locked_by !== req.sessionUser.userId) {
    return json(res, false, { error: 'Категория занята другим сотрудником' }, 409);
  }

  await run(
    `UPDATE active_order_categories
     SET status = 'completed', locked_by = NULL, locked_at = NULL, completed_at = ?
     WHERE category_id = ?`,
    [Date.now(), categoryId]
  );

  const state = await getFullState();
  return json(res, true, { state });
});

app.post('/api/items/:id/increment', requireAuth, async (req, res) => {
  const productId = Number(req.params.id);
  await run(
    `INSERT INTO active_order_items (product_id, qty, picked)
     VALUES (?, 1, 0)
     ON CONFLICT(product_id) DO UPDATE SET qty = qty + 1, picked = 0`,
    [productId]
  );
  const state = await getFullState();
  return json(res, true, { state });
});

app.post('/api/items/:id/decrement', requireAuth, async (req, res) => {
  const productId = Number(req.params.id);
  const row = await get(`SELECT qty FROM active_order_items WHERE product_id = ?`, [productId]);
  if (!row) {
    const state = await getFullState();
    return json(res, true, { state });
  }

  const nextQty = Math.max(0, Number(row.qty) - 1);
  if (nextQty === 0) {
    await run(`DELETE FROM active_order_items WHERE product_id = ?`, [productId]);
  } else {
    await run(`UPDATE active_order_items SET qty = ?, picked = 0 WHERE product_id = ?`, [nextQty, productId]);
  }

  const state = await getFullState();
  return json(res, true, { state });
});

app.post('/api/items/:id/toggle-picked', requireAuth, async (req, res) => {
  const productId = Number(req.params.id);
  const row = await get(`SELECT qty, picked FROM active_order_items WHERE product_id = ?`, [productId]);
  if (!row || Number(row.qty) <= 0) {
    return json(res, false, { error: 'Товар не заказан' }, 400);
  }

  const nextPicked = Number(row.picked) === 1 ? 0 : 1;
  await run(`UPDATE active_order_items SET picked = ? WHERE product_id = ?`, [nextPicked, productId]);

  const state = await getFullState();
  return json(res, true, { state });
});

app.get('/api/picking/print', requireAuth, async (req, res) => {
  const state = await getFullState();
  const lines = [];
  for (const category of state.categories) {
    const products = (state.productsByCategory[category.id] || []).filter((item) => Number(item.qty) > 0);
    if (!products.length) continue;
    for (const product of products) {
      lines.push({
        category: category.name,
        name: product.name,
        qty: Number(product.qty)
      });
    }
  }
  return json(res, true, { lines, generatedAt: Date.now() });
});

app.post('/api/order/complete-all', requireAuth, async (req, res) => {
  await run(`DELETE FROM active_order_items`);
  await run(`UPDATE active_order_categories SET status = 'open', locked_by = NULL, locked_at = NULL, completed_at = NULL`);
  const state = await getFullState();
  return json(res, true, { message: 'Заявка полностью собрана и очищена', state });
});

app.post('/api/order/reset', requireAuth, async (req, res) => {
  await run(`DELETE FROM active_order_items`);
  await run(`UPDATE active_order_categories SET status = 'open', locked_by = NULL, locked_at = NULL, completed_at = NULL`);
  const state = await getFullState();
  return json(res, true, { message: 'Заказ очищен', state });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

async function start() {
  await initDb();
  await seedCategories();
  app.listen(PORT, () => {
    console.log(`Server started on :${PORT}`);
  });
}

start().catch((error) => {
  console.error('Startup error:', error);
  process.exit(1);
});
