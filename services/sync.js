/**
 * ZAN 1.1 - Catalog Sync Service
 * Syncs products from YML feed
 */

const { getDB } = require('./database');
const axios = require('axios');
const xml2js = require('xml2js');

const YML_URL = 'https://milku.ru/site1/export-yandex-YML/';

// Category mapping from YML to local categories
const CATEGORY_MAPPING = {
  'Жидкие конфеты': 'Жидкие конфеты',
  'Карамель, леденцы, шипучки': 'Карамель, леденцы, шипучки',
  'Шоколад': 'Шоколад',
  'Пирожные, бисквиты, печенье': 'Пирожные, бисквиты, печенье',
  'Мармелад, зефир, драже': 'Мармелад, зефир, драже',
  'Жевательная резинка': 'Жевательная резинка',
  'Жевательные конфеты': 'Жевательные конфеты',
  'ЛЕТО26': 'ЛЕТО26',
  'Бакалея': 'Бакалея'
};

async function syncCatalog() {
  const db = getDB();
  
  console.log('[Sync] Starting catalog sync...');
  updateSyncStatus('running', 0, 'fetch', 'Загрузка каталога...');
  
  try {
    // Fetch YML
    const response = await axios.get(YML_URL, { timeout: 60000 });
    const xml = response.data;
    
    updateSyncStatus('running', 10, 'parse', 'Парсинг данных...');
    
    // Parse XML
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xml);
    
    const shop = result.yml_catalog.shop;
    const categories = shop.categories.category;
    const offers = shop.offers.offer;
    
    console.log(`[Sync] Found ${categories.length} categories, ${offers.length} offers`);
    
    // Sync categories
    updateSyncStatus('running', 20, 'categories', 'Обновление категорий...');
    await syncCategories(db, categories);
    
    // Sync products
    updateSyncStatus('running', 30, 'products', 'Обновление товаров...');
    await syncProducts(db, offers);
    
    updateSyncStatus('completed', 100, 'done', `Синхронизация завершена. Товаров: ${offers.length}`);
    console.log('[Sync] Completed successfully');
    
    return { success: true, productsCount: offers.length };
    
  } catch (error) {
    console.error('[Sync] Error:', error.message);
    updateSyncStatus('error', 0, 'error', `Ошибка: ${error.message}`);
    throw error;
  }
}

async function syncCategories(db, categories) {
  const insertStmt = db.prepare(`
    INSERT INTO categories (external_id, name)
    VALUES (?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
    name = excluded.name
  `);
  
  for (const cat of categories) {
    const id = cat.$.id;
    const name = cat._ || cat;
    
    if (CATEGORY_MAPPING[name]) {
      insertStmt.run(id, name);
    }
  }
}

async function syncProducts(db, offers) {
  const insertStmt = db.prepare(`
    INSERT INTO products (
      external_id, category_id, name, vendor_code, 
      picture, price, barcode, stock_quantity
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
    category_id = excluded.category_id,
    name = excluded.name,
    vendor_code = excluded.vendor_code,
    picture = excluded.picture,
    price = excluded.price,
    barcode = excluded.barcode,
    stock_quantity = excluded.stock_quantity,
    updated_at = CURRENT_TIMESTAMP
  `);
  
  let processed = 0;
  const total = offers.length;
  
  for (const offer of offers) {
    const categoryId = offer.categoryId;
    
    // Check if category is in our mapping
    const category = db.prepare('SELECT id FROM categories WHERE external_id = ?').get(categoryId);
    if (!category) continue;
    
    insertStmt.run(
      offer.$.id,
      category.id,
      offer.name,
      offer.vendorCode || null,
      offer.picture || null,
      offer.price || 0,
      offer.barcode || null,
      offer.stock_quantity || 0
    );
    
    processed++;
    
    // Update progress every 100 items
    if (processed % 100 === 0) {
      const progress = 30 + Math.floor((processed / total) * 70);
      updateSyncStatus('running', progress, 'products', `Обработано ${processed}/${total}...`);
    }
  }
  
  console.log(`[Sync] Processed ${processed} products`);
}

function updateSyncStatus(status, progress, stage, message) {
  const db = getDB();
  db.prepare(`
    UPDATE sync_status 
    SET status = ?, progress = ?, stage = ?, message = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(status, progress, stage, message);
}

module.exports = { syncCatalog };
