import path from 'path';
import { getDb } from '../db/connection.js';

export async function getCategories() {
  const db = await getDb();
  return db.all(`
    SELECT c.id, c.name, c.sort_order,
      COUNT(p.id) AS product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id
    ORDER BY c.sort_order ASC
  `);
}

export async function getProductsByCategory(categoryId) {
  const db = await getDb();
  return db.all(
    `SELECT id, category_id, name, vendor_code, picture_cached, picture, barcode, stock_quantity
     FROM products
     WHERE category_id = ?
     ORDER BY COALESCE(sort_name, name) ASC`,
    [categoryId]
  );
}

export async function getCatalogStats() {
  const db = await getDb();
  const [products, noBarcode, syncState] = await Promise.all([
    db.get('SELECT COUNT(*) AS count FROM products'),
    db.get(`SELECT COUNT(*) AS count FROM products WHERE COALESCE(barcode, '') = '' AND hidden_from_product_check = 0`),
    db.get('SELECT * FROM sync_state WHERE id = 1')
  ]);
  return { products: products.count, noBarcode: noBarcode.count, syncState };
}

export function publicImagePath(filename) {
  return `/image-cache-v5/${path.basename(filename)}`;
}
