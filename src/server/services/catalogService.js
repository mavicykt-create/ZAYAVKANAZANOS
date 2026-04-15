import { all, get, run } from '../../db.js';
import { config } from '../config.js';
import { FIXED_CATEGORIES, FIXED_CATEGORY_IDS } from '../constants/categories.js';
import { first, nowTs } from '../utils/format.js';
import { HttpError } from '../utils/http.js';
import { getSyncState, setAppState } from './appStateService.js';
import { cacheWebPath, ensureCompressedImage, preCompressImages } from './imageService.js';

let syncPromise = null;

export function nextSyncAllowedAt(syncState) {
  const anchor = Number(syncState?.lastStartedAt || syncState?.lastFinishedAt || 0) || 0;
  return anchor ? anchor + config.syncCooldownMs : 0;
}

export async function getCatalogCategories() {
  return all(`SELECT id, name, sort_order AS sortOrder FROM catalog_categories ORDER BY sort_order ASC, id ASC`);
}

async function updateSyncProgress({ progress, stage, message, processedOffers, totalOffers }) {
  if (progress !== undefined) await setAppState('sync_progress', String(progress));
  if (stage !== undefined) await setAppState('sync_stage', stage);
  if (message !== undefined) await setAppState('sync_message', message);
  if (processedOffers !== undefined) await setAppState('sync_processed_offers', String(processedOffers));
  if (totalOffers !== undefined) await setAppState('sync_total_offers', String(totalOffers));
}

async function rebuildPriceCheckPages() {
  await run(`DELETE FROM price_check_pages`);
  const rows = await all(
    `SELECT category_id, COUNT(*) AS cnt
     FROM catalog_products
     WHERE category_id IN (${FIXED_CATEGORIES.map((item) => item.id).join(',')})
     GROUP BY category_id`,
  );
  const countByCategory = new Map(rows.map((item) => [Number(item.category_id), Number(item.cnt)]));
  for (const category of FIXED_CATEGORIES) {
    const productsCount = countByCategory.get(Number(category.id)) || 0;
    const pagesCount = Math.max(1, Math.ceil(productsCount / 50));
    for (let page = 1; page <= pagesCount; page += 1) {
      await run(
        `INSERT INTO price_check_pages (category_id, page_number, locked_by, locked_at, completed_by, completed_at)
         VALUES (?, ?, NULL, NULL, NULL, NULL)`,
        [category.id, page],
      );
    }
  }
}

async function syncCatalogFromYml() {
  await setAppState('sync_running', '1');
  await setAppState('sync_last_started_at', String(nowTs()));
  await updateSyncProgress({
    progress: 0,
    stage: 'download',
    message: 'Начинаем загрузку каталога',
    processedOffers: 0,
    totalOffers: 0,
  });

  try {
    const response = await fetch(config.ymlUrl, { headers: { 'User-Agent': 'zan-1.1/1.0' } });
    if (!response.ok) throw new HttpError(502, `Не удалось скачать YML: HTTP ${response.status}`);
    await updateSyncProgress({ progress: 7, stage: 'download', message: 'YML загружен, разбираем XML' });

    const xmlText = await response.text();
    const { parseStringPromise } = await import('xml2js');
    const parsed = await parseStringPromise(xmlText, { explicitArray: true, trim: true });
    const offers = parsed?.yml_catalog?.shop?.[0]?.offers?.[0]?.offer || [];

    const prepared = [];
    for (const offer of offers) {
      const categoryId = Number(first(offer.categoryId));
      if (!FIXED_CATEGORY_IDS.has(categoryId)) continue;
      const name = first(offer.name);
      const vendorCode = first(offer.vendorCode);
      if (!name || !vendorCode) continue;
      const stockRaw = first(offer.stock_quantity) || first(offer.quantity) || '';
      prepared.push({
        externalId: first(offer?.$?.id || vendorCode),
        categoryId,
        name,
        vendorCode,
        picture: first(offer.picture),
        description: first(offer.description),
        price: Number(String(first(offer.price, '0')).replace(',', '.')) || 0,
        barcode: first(offer.barcode),
        stockQuantity: stockRaw === '' ? null : Number(stockRaw),
      });
    }

    await updateSyncProgress({
      progress: 12,
      stage: 'parse',
      message: `Найдено товаров: ${prepared.length}`,
      totalOffers: prepared.length,
      processedOffers: 0,
    });

    const allPictures = prepared.map((item) => item.picture).filter(Boolean);
    await updateSyncProgress({
      progress: 15,
      stage: 'images',
      message: 'Предсжатие картинок',
      totalOffers: prepared.length,
      processedOffers: 0,
    });
    await preCompressImages(allPictures, (done, total) => {
      const imagesPart = total === 0 ? 0 : Math.round((done / total) * 35);
      void updateSyncProgress({
        progress: 15 + imagesPart,
        stage: 'images',
        message: `Картинки подготовлены: ${done}/${total}`,
      });
    });

    await updateSyncProgress({
      progress: 55,
      stage: 'save',
      message: 'Сохраняем товары в базу',
      totalOffers: prepared.length,
      processedOffers: 0,
    });

    let processed = 0;
    for (const item of prepared) {
      const cachedFile = item.picture ? await ensureCompressedImage(item.picture) : '';
      await run(
        `INSERT INTO catalog_products (
           external_id, category_id, name, vendor_code, picture, cached_image,
           description, price, barcode, stock_quantity, sort_order, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(category_id, vendor_code) DO UPDATE SET
           external_id = excluded.external_id,
           name = excluded.name,
           picture = excluded.picture,
           cached_image = excluded.cached_image,
           description = excluded.description,
           price = excluded.price,
           barcode = excluded.barcode,
           stock_quantity = excluded.stock_quantity,
           updated_at = excluded.updated_at`,
        [
          item.externalId,
          item.categoryId,
          item.name,
          item.vendorCode,
          item.picture,
          cachedFile ? cacheWebPath(cachedFile) : '',
          item.description,
          item.price,
          item.barcode,
          item.stockQuantity,
          0,
          nowTs(),
        ],
      );

      processed += 1;
      if (processed % 30 === 0 || processed === prepared.length) {
        const progress = 55 + Math.round((processed / Math.max(prepared.length, 1)) * 40);
        await updateSyncProgress({
          progress,
          stage: 'save',
          message: `Сохранено товаров: ${processed}/${prepared.length}`,
          processedOffers: processed,
          totalOffers: prepared.length,
        });
      }
    }

    await rebuildPriceCheckPages();
    await setAppState('catalog_synced_at', String(nowTs()));
    await setAppState('sync_running', '0');
    await setAppState('sync_last_finished_at', String(nowTs()));
    await updateSyncProgress({
      progress: 100,
      stage: 'done',
      message: 'Каталог обновлён',
      processedOffers: prepared.length,
      totalOffers: prepared.length,
    });
  } catch (error) {
    await setAppState('sync_running', '0');
    await setAppState('sync_stage', 'error');
    await setAppState('sync_message', error.message || 'Ошибка синхронизации');
    throw error;
  }
}

export async function startCatalogSync() {
  const syncState = await getSyncState();
  if (syncState.running || syncPromise) throw new HttpError(409, 'Обновление каталога уже выполняется');
  const allowedAt = nextSyncAllowedAt(syncState);
  if (allowedAt && nowTs() < allowedAt) {
    const waitMin = Math.ceil((allowedAt - nowTs()) / 60000);
    throw new HttpError(429, `Каталог можно обновлять раз в час. Осталось ${waitMin} мин.`);
  }
  syncPromise = syncCatalogFromYml().finally(() => {
    syncPromise = null;
  });
}

export async function resetCatalogSync() {
  syncPromise = null;
  await setAppState('sync_running', '0');
  await setAppState('sync_progress', '0');
  await setAppState('sync_stage', 'idle');
  await setAppState('sync_message', 'Обновление сброшено вручную');
  await setAppState('sync_total_offers', '0');
  await setAppState('sync_processed_offers', '0');
}

export async function getCatalogStats() {
  const [products, noBarcode] = await Promise.all([
    get(`SELECT COUNT(*) AS cnt FROM catalog_products`),
    get(`SELECT COUNT(*) AS cnt FROM catalog_products WHERE barcode IS NULL OR TRIM(barcode) = ''`),
  ]);
  return {
    totalProducts: Number(products?.cnt || 0),
    noBarcodeProducts: Number(noBarcode?.cnt || 0),
  };
}
