import { getDb } from '../db/connection.js';
import { logAction } from './statsService.js';
import { HttpError } from '../utils/httpError.js';

export async function listProductsWithoutBarcode() {
  const db = await getDb();
  return db.all(`
    SELECT p.id, p.name, p.vendor_code, c.name AS category_name
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE COALESCE(p.barcode, '') = '' AND p.hidden_from_product_check = 0
    ORDER BY c.sort_order, COALESCE(p.sort_name, p.name)
  `);
}

export async function hideFromProductCheck(userId, productId) {
  const db = await getDb();
  const row = await db.get('SELECT id FROM products WHERE id = ?', [productId]);
  if (!row) throw new HttpError(404, 'Товар не найден');
  await db.run('UPDATE products SET hidden_from_product_check = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [productId]);
  await logAction({ userId, action: 'hide_product_check', module: 'product-check', entityId: String(productId) });
}
