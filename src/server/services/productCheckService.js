import { all, run } from '../../db.js';
import { nowTs } from '../utils/format.js';
import { HttpError } from '../utils/http.js';

export async function getProductsWithoutBarcode() {
  const rows = await all(
    `SELECT p.id, p.name, p.vendor_code AS vendorCode, p.cached_image AS cachedImage,
            p.picture, c.id AS categoryId, c.name AS categoryName
     FROM catalog_products p
     JOIN catalog_categories c ON c.id = p.category_id
     WHERE (p.barcode IS NULL OR TRIM(p.barcode) = '')
       AND COALESCE(p.hidden_from_product_check, 0) = 0
     ORDER BY c.sort_order ASC, c.id ASC, p.name COLLATE NOCASE ASC`,
  );
  return rows.map((item) => ({
    id: Number(item.id),
    name: item.name,
    vendorCode: item.vendorCode,
    picture: item.picture || '',
    cachedImage: item.cachedImage || '',
    categoryId: Number(item.categoryId),
    categoryName: item.categoryName,
  }));
}

export async function hideProductFromProductCheck(productId) {
  const result = await run(
    `UPDATE catalog_products
     SET hidden_from_product_check = 1, updated_at = ?
     WHERE id = ?`,
    [nowTs(), Number(productId)],
  );
  if (result.changes === 0) throw new HttpError(404, 'Товар не найден');
}
