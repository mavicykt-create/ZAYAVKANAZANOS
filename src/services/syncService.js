import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { parseStringPromise } from 'xml2js';
import { db } from '../db.js';
import { FIXED_CATEGORIES, IMAGE_CACHE_DIR, YML_URL } from '../config.js';
import { ensureDir } from '../utils/fs.js';
import { nowIso } from '../utils/time.js';

let running = false;

function setStatus(percent, stage, message, extras = {}) {
  const now = nowIso();
  db.prepare(`
    UPDATE sync_status
    SET is_running = ?, percent = ?, stage = ?, message = ?, updated_at = ?,
        started_at = COALESCE(?, started_at),
        finished_at = COALESCE(?, finished_at),
        last_success_at = COALESCE(?, last_success_at)
    WHERE id = 1
  `).run(extras.is_running ?? (running ? 1 : 0), percent, stage, message, now,
    extras.started_at ?? null, extras.finished_at ?? null, extras.last_success_at ?? null);
}

function parseNumber(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function pickText(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return pickText(v[0]);
  if (typeof v === 'object' && '_' in v) return String(v._);
  return String(v);
}

async function cacheImage(url, vendorCode) {
  if (!url) return '';
  ensureDir(IMAGE_CACHE_DIR);
  const hash = crypto.createHash('md5').update(`${vendorCode}|${url}`).digest('hex');
  const fileName = `${hash}.webp`;
  const target = path.join(IMAGE_CACHE_DIR, fileName);
  if (fs.existsSync(target)) return `/image-cache/${fileName}`;

  const response = await fetch(url, { headers: { 'User-Agent': 'ZAN/1.1' } });
  if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
  const arr = Buffer.from(await response.arrayBuffer());

  await sharp(arr)
    .resize({ width: 100, withoutEnlargement: true })
    .webp({ quality: 20 })
    .toFile(target);

  return `/image-cache/${fileName}`;
}

export async function runCatalogSync() {
  if (running) {
    return { ok: false, message: 'sync already running' };
  }
  running = true;
  setStatus(0, 'start', 'Запуск обновления', { is_running: 1, started_at: nowIso(), finished_at: null });

  try {
    setStatus(5, 'download', 'Загрузка YML');
    const response = await fetch(YML_URL, { headers: { 'User-Agent': 'ZAN/1.1' } });
    if (!response.ok) throw new Error(`YML download failed: ${response.status}`);
    const xml = await response.text();

    setStatus(15, 'parse', 'Парсинг YML');
    const parsed = await parseStringPromise(xml, { explicitArray: false, mergeAttrs: true });
    const offersRaw = parsed?.yml_catalog?.shop?.offers?.offer;
    const offers = Array.isArray(offersRaw) ? offersRaw : (offersRaw ? [offersRaw] : []);
    const categorySet = new Set(FIXED_CATEGORIES.map(x => String(x.id)));

    setStatus(25, 'prepare', `Найдено товаров: ${offers.length}`);

    const upsert = db.prepare(`
      INSERT INTO catalog_items (
        external_id, category_id, name, vendor_code, picture, picture_cached, description,
        price, barcode, stock_quantity, hidden_from_product_check, sort_name, updated_at
      ) VALUES (
        @external_id, @category_id, @name, @vendor_code, @picture, @picture_cached, @description,
        @price, @barcode, @stock_quantity, COALESCE(@hidden_from_product_check, 0), @sort_name, @updated_at
      )
      ON CONFLICT(external_id) DO UPDATE SET
        category_id=excluded.category_id,
        name=excluded.name,
        vendor_code=excluded.vendor_code,
        picture=excluded.picture,
        picture_cached=COALESCE(excluded.picture_cached, catalog_items.picture_cached),
        description=excluded.description,
        price=excluded.price,
        barcode=excluded.barcode,
        stock_quantity=excluded.stock_quantity,
        sort_name=excluded.sort_name,
        updated_at=excluded.updated_at
    `);

    const transaction = db.transaction((rows) => {
      for (const row of rows) upsert.run(row);
    });

    const prepared = [];
    let done = 0;
    for (const offer of offers) {
      const categoryId = String(offer.categoryId ?? '');
      if (!categorySet.has(categoryId)) continue;

      const picture = pickText(offer.picture);
      const vendorCode = pickText(offer.vendorCode) || pickText(offer.vendor_code);
      let pictureCached = '';
      try {
        if (picture) pictureCached = await cacheImage(picture, vendorCode || pickText(offer.id));
      } catch {
        pictureCached = '';
      }

      prepared.push({
        external_id: pickText(offer.id),
        category_id: Number(categoryId),
        name: pickText(offer.name),
        vendor_code: vendorCode,
        picture,
        picture_cached: pictureCached,
        description: pickText(offer.description),
        price: parseNumber(offer.price),
        barcode: pickText(offer.barcode),
        stock_quantity: parseNumber(offer.quantityInStock ?? offer.stock_quantity ?? offer.count),
        sort_name: pickText(offer.name).toLowerCase(),
        updated_at: nowIso()
      });

      done += 1;
      if (done % 50 === 0) {
        const percent = Math.min(90, 25 + Math.round(done / Math.max(offers.length, 1) * 60));
        setStatus(percent, 'images', `Подготовлено ${done}/${offers.length}`);
      }
    }

    setStatus(92, 'database', 'Сохранение в базу');
    transaction(prepared);

    setStatus(100, 'done', `Обновлено товаров: ${prepared.length}`, {
      is_running: 0,
      finished_at: nowIso(),
      last_success_at: nowIso()
    });
    running = false;
    return { ok: true, count: prepared.length };
  } catch (error) {
    running = false;
    setStatus(0, 'error', error.message, { is_running: 0, finished_at: nowIso() });
    return { ok: false, message: error.message };
  }
}

export function resetSyncStatus() {
  running = false;
  db.prepare(`
    UPDATE sync_status
    SET is_running = 0, percent = 0, stage = 'idle', message = 'Сброшено', updated_at = ?, finished_at = ?
    WHERE id = 1
  `).run(nowIso(), nowIso());
  return db.prepare(`SELECT * FROM sync_status WHERE id = 1`).get();
}

export function getSyncStatus() {
  return db.prepare(`SELECT * FROM sync_status WHERE id = 1`).get();
}
