const Database = require('better-sqlite3');
const path = require('path');
const xml2js = require('xml2js');
const sharp = require('sharp');
const fs = require('fs');
const fetch = require('node-fetch');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/zan11.db');
const IMAGE_CACHE = path.join(__dirname, '../data/image-cache-v5');
const YML_URL = 'https://milku.ru/site1/export-yandex-YML/';

const CATEGORY_MAP = {
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

function getDB() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

function updateStatus(status, progress, stage, message, productsCount = null) {
  const db = getDB();
  const updates = ['status = ?', 'progress = ?', 'stage = ?', 'message = ?'];
  const values = [status, progress, stage, message];

  if (productsCount !== null) {
    updates.push('products_count = ?');
    values.push(productsCount);
  }

  if (status === 'completed') {
    updates.push('last_sync_at = CURRENT_TIMESTAMP');
  }

  db.prepare(`UPDATE sync_status SET ${updates.join(', ')} WHERE id = 1`).run(...values);
  console.log(`[${status}] ${progress}% - ${message}`);
}


function parseBoxBlockCount(name) {
  // Parse X/Y from product name: X = blocks in box, Y = items per block
  const match = name.match(/(\d+)\s*\/\s*(\d+)/);
  if (match) {
    return {
      boxCount: parseInt(match[1]) || 0,
      blockCount: parseInt(match[2]) || 0
    };
  }
  return { boxCount: 0, blockCount: 0 };
}

async function downloadImage(imageUrl, filename) {
  try {
    if (!fs.existsSync(IMAGE_CACHE)) {
      fs.mkdirSync(IMAGE_CACHE, { recursive: true });
    }

    const response = await fetch(imageUrl, { 
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      return null;
    }

    const buffer = await response.buffer();

    if (buffer.length < 100) {
      return null;
    }

    const compressed = await sharp(buffer)
      .resize(120, 120, { 
        fit: 'cover',
        withoutEnlargement: true 
      })
      .webp({ quality: 25, effort: 4 })
      .toBuffer();

    const outputPath = path.join(IMAGE_CACHE, `${filename}.webp`);
    fs.writeFileSync(outputPath, compressed);

    return `/data/image-cache-v5/${filename}.webp`;
  } catch (e) {
    return null;
  }
}

async function syncCatalog() {
  console.log('Starting catalog sync...');
  updateStatus('running', 0, 'download', 'Загрузка YML...');

  try {
    const response = await fetch(YML_URL, { 
      timeout: 120000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();
    updateStatus('running', 10, 'parse', 'Парсинг XML...');

    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xml);

    const offers = result.yml_catalog.shop[0].offers[0].offer;
    const totalOffers = offers.length;

    updateStatus('running', 15, 'process', `Найдено ${totalOffers} товаров`, 0);

    const db = getDB();
    db.prepare('DELETE FROM products').run();

    const insertProduct = db.prepare(`
      INSERT INTO products (external_id, category_id, name, vendor_code, picture,
                           picture_original, description, price, barcode, expiry_date, stock_quantity, box_count, block_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let processed = 0;
    let withImages = 0;
    const validCategoryIds = Object.keys(CATEGORY_MAP).map(Number);

    // Фильтруем только нужные категории
    const filteredOffers = offers.filter(offer => {
      const categoryId = parseInt(offer.categoryId[0]);
      return validCategoryIds.includes(categoryId);
    });

    const totalToProcess = filteredOffers.length;
    console.log(`Filtered ${totalToProcess} products from ${totalOffers} total`);

    updateStatus('running', 20, 'process', `Обработка ${totalToProcess} товаров...`, 0);

    for (let i = 0; i < filteredOffers.length; i++) {
      const offer = filteredOffers[i];
      const categoryId = parseInt(offer.categoryId[0]);

      const externalId = offer.$.id;
      const name = offer.name[0];
      const vendorCode = offer.vendorCode ? offer.vendorCode[0] : '';
      const pictureOriginal = offer.picture ? offer.picture[0] : '';
      const description = offer.description ? offer.description[0] : '';
      const price = parseFloat(offer.price[0]) || 0;
      const barcode = offer.barcode ? offer.barcode[0] : '';
            // Parse stock from <count> tag in YML
      let stock = 0;
      if (offer.count && offer.count[0]) {
        stock = parseInt(offer.count[0]) || 0;
      } else if (offer.stock && offer.stock[0]) {
        stock = parseInt(offer.stock[0]) || 0;
      }

      // Извлекаем срок годности из параметров
      let expiryDate = '';
      if (offer.param) {
        const expiryParam = offer.param.find(p => p.$.name === 'Срок годности');
        if (expiryParam) {
          expiryDate = expiryParam._ || '';
          // Сохраняем в ISO формате ГГГГ-ММ-ДД для корректной работы светофора
          if (expiryDate && !expiryDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Если формат не ISO, пробуем преобразовать
            const parts = expiryDate.split(/[.-]/);
            if (parts.length === 3) {
              if (parts[0].length === 4) {
                // Уже ГГГГ-ММ-ДД
              } else {
                // ДД.ММ.ГГ или ДД-ММ-ГГ
                const d = parts[0], m = parts[1], y = parts[2];
                expiryDate = `20${y}-${m}-${d}`;
              }
            }
          }
        }
      }

      let localPicture = '';
      if (pictureOriginal) {
        const filename = `prod_${externalId}`;
        localPicture = await downloadImage(pictureOriginal, filename);
        if (localPicture) withImages++;
      }

      // Parse box and block counts from product name
      const { boxCount, blockCount } = parseBoxBlockCount(name);

      insertProduct.run(
        externalId, categoryId, name, vendorCode,
        localPicture, pictureOriginal, description, price, barcode, expiryDate, stock, boxCount, blockCount
      );

      processed++;

      // Обновляем прогресс каждые 5 товаров
      if (processed % 5 === 0 || processed === totalToProcess) {
        const progress = 20 + Math.floor((processed / totalToProcess) * 75);
        updateStatus('running', progress, 'process', 
          `Обработано ${processed}/${totalToProcess} (${withImages} с фото)`, processed);
      }
    }

    updateStatus('completed', 100, 'done', 
      `Готово! ${processed} товаров, ${withImages} с фото`, processed);
    console.log(`Sync completed. ${processed} products, ${withImages} with images.`);

  } catch (error) {
    console.error('Sync error:', error);
    updateStatus('error', 0, 'error', error.message);
    throw error;
  }
}

if (require.main === module) {
  syncCatalog().then(() => {
    console.log('Done');
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { syncCatalog };
