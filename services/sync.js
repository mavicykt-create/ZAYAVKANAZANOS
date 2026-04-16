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
      console.log(`Failed to download ${imageUrl}: ${response.status}`);
      return null;
    }

    const buffer = await response.buffer();

    if (buffer.length < 100) {
      console.log(`Invalid image (too small): ${imageUrl}`);
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

    console.log(`Downloaded: ${filename}`);
    return `/data/image-cache-v5/${filename}.webp`;
  } catch (e) {
    console.error(`Error processing image ${imageUrl}:`, e.message);
    return null;
  }
}

async function syncCatalog() {
  console.log('Starting catalog sync...');
  updateStatus('running', 0, 'download', 'Downloading YML...');

  try {
    console.log('Fetching YML from:', YML_URL);
    const response = await fetch(YML_URL, { 
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();
    console.log('YML downloaded, size:', xml.length);

    updateStatus('running', 10, 'parse', 'Parsing XML...');

    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xml);

    const offers = result.yml_catalog.shop[0].offers[0].offer;
    console.log('Total offers in YML:', offers.length);

    updateStatus('running', 20, 'process', `Processing ${offers.length} products...`, offers.length);

    const db = getDB();
    db.prepare('DELETE FROM products').run();
    console.log('Cleared existing products');

    const insertProduct = db.prepare(`
      INSERT INTO products (external_id, category_id, name, vendor_code, picture, 
                           picture_original, description, price, barcode, stock_quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let processed = 0;
    let withImages = 0;
    const validCategoryIds = Object.keys(CATEGORY_MAP).map(Number);

    for (const offer of offers) {
      const categoryId = parseInt(offer.categoryId[0]);

      if (!validCategoryIds.includes(categoryId)) continue;

      const externalId = offer.$.id;
      const name = offer.name[0];
      const vendorCode = offer.vendorCode ? offer.vendorCode[0] : '';
      const pictureOriginal = offer.picture ? offer.picture[0] : '';
      const description = offer.description ? offer.description[0] : '';
      const price = parseFloat(offer.price[0]) || 0;
      const barcode = offer.barcode ? offer.barcode[0] : '';
      const stock = offer.stock ? parseInt(offer.stock[0]) : 0;

      let localPicture = '';
      if (pictureOriginal) {
        const filename = `prod_${externalId}_${Date.now()}`;
        localPicture = await downloadImage(pictureOriginal, filename);
        if (localPicture) withImages++;
      }

      insertProduct.run(
        externalId, categoryId, name, vendorCode, 
        localPicture, pictureOriginal, description, price, barcode, stock
      );

      processed++;

      if (processed % 10 === 0) {
        const progress = 20 + Math.floor((processed / Math.min(offers.length, 500)) * 70);
        updateStatus('running', progress, 'process', `Processed ${processed} products, ${withImages} with images...`);
      }

      if (processed >= 500) break;
    }

    updateStatus('completed', 100, 'done', `Sync completed. ${processed} products, ${withImages} with images.`, processed);
    console.log(`Sync completed. ${processed} products processed, ${withImages} with images.`);

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
