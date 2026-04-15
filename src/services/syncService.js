import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { parseStringPromise } from 'xml2js';
import { env } from '../config/env.js';
import { getDb } from '../db/connection.js';
import { publicImagePath } from './catalogService.js';

let running = false;

async function setState(patch) {
  const db = await getDb();
  const current = await db.get('SELECT * FROM sync_state WHERE id = 1');
  const next = { ...current, ...patch };
  await db.run(
    `UPDATE sync_state SET
      status = ?, progress_percent = ?, stage = ?, message = ?,
      last_started_at = ?, last_finished_at = ?, last_error = ?,
      items_total = ?, items_done = ?, reset_requested = ?
     WHERE id = 1`,
    [
      next.status,
      next.progress_percent,
      next.stage,
      next.message,
      next.last_started_at,
      next.last_finished_at,
      next.last_error,
      next.items_total,
      next.items_done,
      next.reset_requested
    ]
  );
}

export async function getSyncState() {
  const db = await getDb();
  return db.get('SELECT * FROM sync_state WHERE id = 1');
}

export async function requestResetSync() {
  await setState({ reset_requested: 1, status: 'idle', progress_percent: 0, stage: 'Сброс', message: 'Запрошен сброс обновления' });
}

async function fetchCatalogXml() {
  const response = await fetch(env.catalogUrl, { headers: { 'User-Agent': 'ZAN/1.1' } });
  if (!response.ok) throw new Error(`Не удалось скачать каталог: ${response.status}`);
  return response.text();
}

function pickOfferValue(offer, key) {
  const value = offer[key];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

async function cacheImage(url, vendorCode) {
  if (!url) return null;
  const filename = `${vendorCode || 'item'}-${Buffer.from(url).toString('base64url').slice(0, 8)}.webp`;
  const dest = path.join(env.imageCacheDir, filename);
  if (fs.existsSync(dest)) return publicImagePath(dest);

  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'ZAN/1.1 image prefetch' } });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const input = Buffer.from(arrayBuffer);
    await sharp(input)
      .rotate()
      .resize({ width: 100, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 22 })
      .toFile(dest);
    return publicImagePath(dest);
  } catch {
    return null;
  }
}

export async function runCatalogSync() {
  if (running) return { ok: false, message: 'Синхронизация уже идет' };
  running = true;
  fs.mkdirSync(env.imageCacheDir, { recursive: true });

  try {
    await setState({
      status: 'running',
      progress_percent: 1,
      stage: 'Загрузка',
      message: 'Скачивание YML',
      last_started_at: new Date().toISOString(),
      last_error: null,
      items_total: 0,
      items_done: 0,
      reset_requested: 0
    });

    const xml = await fetchCatalogXml();
    await setState({ progress_percent: 10, stage: 'Парсинг', message: 'Разбор XML/YML' });
    const parsed = await parseStringPromise(xml, { explicitArray: true, mergeAttrs: true, trim: true });
    const offers = parsed?.yml_catalog?.shop?.[0]?.offers?.[0]?.offer || [];
    const allowedCategoryIds = new Set([54, 57, 65, 81, 85, 92, 97, 101, 105]);
    const filtered = offers.filter((offer) => allowedCategoryIds.has(Number(pickOfferValue(offer, 'categoryId'))));

    const db = await getDb();
    await setState({ progress_percent: 15, stage: 'Сохранение', message: 'Запись товаров', items_total: filtered.length, items_done: 0 });

    let done = 0;
    for (const offer of filtered) {
      const categoryId = Number(pickOfferValue(offer, 'categoryId'));
      const vendorCode = String(pickOfferValue(offer, 'vendorCode') || '').trim();
      if (!vendorCode) continue;
      const imageUrl = String(pickOfferValue(offer, 'picture') || '').trim();
      const cachedImage = await cacheImage(imageUrl, vendorCode);
      await db.run(
        `INSERT INTO products (
          external_id, category_id, name, vendor_code, picture, picture_cached,
          description, price, barcode, stock_quantity, sort_name, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, lower(?), CURRENT_TIMESTAMP)
        ON CONFLICT(vendor_code) DO UPDATE SET
          external_id = excluded.external_id,
          category_id = excluded.category_id,
          name = excluded.name,
          picture = excluded.picture,
          picture_cached = COALESCE(excluded.picture_cached, products.picture_cached),
          description = excluded.description,
          price = excluded.price,
          barcode = excluded.barcode,
          stock_quantity = excluded.stock_quantity,
          sort_name = excluded.sort_name,
          updated_at = CURRENT_TIMESTAMP`,
        [
          String(offer.id || ''),
          categoryId,
          String(pickOfferValue(offer, 'name') || '').trim(),
          vendorCode,
          imageUrl,
          cachedImage,
          String(pickOfferValue(offer, 'description') || '').trim(),
          Number(pickOfferValue(offer, 'price') || 0),
          String(pickOfferValue(offer, 'barcode') || '').trim(),
          Number(pickOfferValue(offer, 'stock_quantity') || 0),
          String(pickOfferValue(offer, 'name') || '').trim()
        ]
      );
      done += 1;
      if (done % 10 === 0 || done === filtered.length) {
        const progress = Math.min(99, 15 + Math.floor((done / Math.max(filtered.length, 1)) * 84));
        await setState({ progress_percent: progress, stage: 'Картинки и каталог', message: `Обработано ${done} из ${filtered.length}`, items_done: done });
      }
    }

    await setState({
      status: 'idle',
      progress_percent: 100,
      stage: 'Готово',
      message: `Каталог обновлен. Товаров: ${filtered.length}`,
      last_finished_at: new Date().toISOString(),
      items_done: filtered.length
    });
    return { ok: true, message: 'Каталог обновлен' };
  } catch (error) {
    await setState({
      status: 'error',
      stage: 'Ошибка',
      message: error.message,
      last_error: error.message,
      last_finished_at: new Date().toISOString()
    });
    return { ok: false, message: error.message };
  } finally {
    running = false;
  }
}

export function startSyncScheduler() {
  setInterval(async () => {
    const state = await getSyncState();
    if (state?.reset_requested) {
      await setState({ reset_requested: 0, status: 'idle', progress_percent: 0, stage: 'Сброшено', message: 'Обновление сброшено' });
      return;
    }
    if (!running) {
      await runCatalogSync();
    }
  }, env.syncIntervalMs);
}
