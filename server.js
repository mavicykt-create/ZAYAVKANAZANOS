import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { parseStringPromise } from 'xml2js';
import { initDb, run, get, all } from './src/db.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const PORT = Number(process.env.PORT || 3000);
const LOGIN = process.env.APP_LOGIN || 'user';
const PASSWORD = process.env.APP_PASSWORD || '7895123';
const YML_URL = process.env.YML_URL || 'https://milku.ru/site1/export-yandex-YML/';
const LOCK_TTL_MS = Number(process.env.LOCK_TTL_MS || 2 * 60 * 1000);
const IMAGE_WIDTH = Number(process.env.IMAGE_WIDTH || 180);
const IMAGE_QUALITY = Number(process.env.IMAGE_QUALITY || 34);
const DB_DIR = process.env.DB_DIR || '/data';

// 🔥 ВЕРСИЯ КЭША (меняешь v3 → v4 и всё обновится)
const IMAGE_CACHE_VERSION = process.env.IMAGE_CACHE_VERSION || 'v3';
const IMAGE_CACHE_DIR = path.join(DB_DIR, `image-cache-${IMAGE_CACHE_VERSION}`);

fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });

const sessions = new Map();
let syncPromise = null;

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
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const queryToken = typeof req.query?.token === 'string' ? req.query.token.trim() : '';
  const token = bearer || queryToken;
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

// ================= КЭШ КАРТИНОК =================
function imageCachePath(url) {
  const hash = crypto.createHash('sha1')
    .update(`${IMAGE_CACHE_VERSION}|${IMAGE_WIDTH}|${IMAGE_QUALITY}|${url}`)
    .digest('hex');

  return path.join(IMAGE_CACHE_DIR, `${hash}.webp`);
}

async function ensureCompressedImage(url) {
  const cacheFile = imageCachePath(url);

  if (fs.existsSync(cacheFile)) {
    return cacheFile;
  }

  const response = await fetch(url, {
    headers: { 'User-Agent': 'zan-1.0' }
  });

  if (!response.ok) {
    throw new Error(`Ошибка загрузки картинки: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  const output = await sharp(buffer)
    .resize({
      width: IMAGE_WIDTH,
      height: IMAGE_WIDTH,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({
      quality: IMAGE_QUALITY,
      effort: 6
    })
    .toBuffer();

  fs.writeFileSync(cacheFile, output);

  return cacheFile;
}

// ================= API КАРТИНОК =================
app.get('/api/image', requireAuth, async (req, res) => {
  try {
    const url = String(req.query.url || '');

    if (!url.startsWith('http')) {
      return res.status(400).send('bad url');
    }

    const file = await ensureCompressedImage(url);

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    return res.sendFile(file);

  } catch (e) {
    return res.status(500).send('');
  }
});

// ================= ОБНОВЛЕНИЕ YML =================
async function syncCatalogFromYml() {
  const response = await fetch(YML_URL);
  const xml = await response.text();

  const parsed = await parseStringPromise(xml);

  const offers = parsed?.yml_catalog?.shop?.[0]?.offers?.[0]?.offer || [];

  for (const offer of offers) {
    const categoryId = Number(offer.categoryId?.[0]);

    if (!CATEGORIES[categoryId]) continue;

    const name = offer.name?.[0];
    const vendorCode = offer.vendorCode?.[0];
    const picture = offer.picture?.[0];

    if (!name || !vendorCode) continue;

    await run(
      `INSERT INTO catalog_products (category_id, name, vendor_code, picture)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(category_id, vendor_code)
       DO UPDATE SET name=excluded.name, picture=excluded.picture`,
      [categoryId, name, vendorCode, picture]
    );
  }
}

// ================= ЗАПУСК =================
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log('ZAN 1.0 запущен');
  });
}

start();
