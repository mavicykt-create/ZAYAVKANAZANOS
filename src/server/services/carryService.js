import { all, get, run } from '../../db.js';
import { FIXED_CATEGORIES } from '../constants/categories.js';
import { nowTs } from '../utils/format.js';
import { HttpError } from '../utils/http.js';
import { logUserAction } from './actionLogService.js';

function stepByProductName(name) {
  return String(name || '').includes('1/') ? 5 : 1;
}

export async function listCarryCategories() {
  const rows = await all(
    `SELECT c.id, c.name, c.sort_order AS sortOrder, conf.confirmed_by AS confirmedBy,
            conf.confirmed_at AS confirmedAt
     FROM catalog_categories c
     LEFT JOIN carry_category_confirmations conf ON conf.category_id = c.id
     ORDER BY c.sort_order ASC, c.id ASC`,
  );
  if (rows.length > 0) return rows.map((item) => ({ ...item, confirmedBy: item.confirmedBy || null, confirmedAt: item.confirmedAt || null }));
  return FIXED_CATEGORIES.map((item) => ({ ...item, confirmedBy: null, confirmedAt: null }));
}

export async function getCarryCategoryProducts(categoryId) {
  const category = await get(`SELECT id, name FROM catalog_categories WHERE id = ?`, [Number(categoryId)]);
  if (!category) throw new HttpError(404, 'Категория не найдена');
  const products = await all(
    `SELECT p.id, p.name, p.vendor_code AS vendorCode, p.picture, p.cached_image AS cachedImage,
            COALESCE(i.qty, 0) AS qty,
            COALESCE(i.picked, 0) AS picked
     FROM catalog_products p
     LEFT JOIN carry_order_items i ON i.product_id = p.id
     WHERE p.category_id = ?
     ORDER BY p.name COLLATE NOCASE ASC`,
    [Number(categoryId)],
  );
  return {
    category: { id: Number(category.id), name: category.name },
    products: products.map((item) => ({
      id: Number(item.id),
      name: item.name,
      vendorCode: item.vendorCode,
      picture: item.picture || '',
      cachedImage: item.cachedImage || '',
      qty: Number(item.qty || 0),
      picked: Number(item.picked || 0) === 1,
    })),
  };
}

export async function incrementCarryItem(userId, productId) {
  const product = await get(`SELECT id, name FROM catalog_products WHERE id = ?`, [Number(productId)]);
  if (!product) throw new HttpError(404, 'Товар не найден');
  const step = stepByProductName(product.name);
  await run(
    `INSERT INTO carry_order_items (product_id, qty, picked, updated_at)
     VALUES (?, ?, 0, ?)
     ON CONFLICT(product_id) DO UPDATE SET
       qty = qty + ?,
       picked = 0,
       updated_at = excluded.updated_at`,
    [Number(productId), step, nowTs(), step],
  );
  await logUserAction(userId, 'increment', {
    module: 'carry',
    entityId: String(productId),
    payload: { step },
  });
}

export async function decrementCarryItem(userId, productId) {
  const product = await get(`SELECT id, name FROM catalog_products WHERE id = ?`, [Number(productId)]);
  if (!product) throw new HttpError(404, 'Товар не найден');
  const row = await get(`SELECT qty FROM carry_order_items WHERE product_id = ?`, [Number(productId)]);
  if (!row) return 0;

  const step = stepByProductName(product.name);
  const nextQty = Math.max(0, Number(row.qty || 0) - step);
  if (nextQty === 0) {
    await run(`DELETE FROM carry_order_items WHERE product_id = ?`, [Number(productId)]);
  } else {
    await run(
      `UPDATE carry_order_items SET qty = ?, picked = 0, updated_at = ? WHERE product_id = ?`,
      [nextQty, nowTs(), Number(productId)],
    );
  }
  await logUserAction(userId, 'decrement', {
    module: 'carry',
    entityId: String(productId),
    payload: { step },
  });
  return nextQty;
}

export async function confirmCarryCategory(userId, categoryId) {
  await run(
    `INSERT INTO carry_category_confirmations (category_id, confirmed_by, confirmed_at)
     VALUES (?, ?, ?)
     ON CONFLICT(category_id) DO UPDATE SET
       confirmed_by = excluded.confirmed_by,
       confirmed_at = excluded.confirmed_at`,
    [Number(categoryId), Number(userId), nowTs()],
  );
  await logUserAction(userId, 'complete_category', {
    module: 'carry',
    entityId: String(categoryId),
  });
}

export async function getCarryPicking() {
  const rows = await all(
    `SELECT c.id AS categoryId, c.name AS categoryName,
            p.id AS productId, p.name, p.vendor_code AS vendorCode,
            p.picture, p.cached_image AS cachedImage,
            i.qty, i.picked
     FROM carry_order_items i
     JOIN catalog_products p ON p.id = i.product_id
     JOIN catalog_categories c ON c.id = p.category_id
     WHERE i.qty > 0
     ORDER BY c.sort_order ASC, c.id ASC, p.name COLLATE NOCASE ASC`,
  );
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.categoryId)) {
      grouped.set(row.categoryId, {
        categoryId: Number(row.categoryId),
        categoryName: row.categoryName,
        items: [],
      });
    }
    grouped.get(row.categoryId).items.push({
      productId: Number(row.productId),
      name: row.name,
      vendorCode: row.vendorCode,
      picture: row.picture || '',
      cachedImage: row.cachedImage || '',
      qty: Number(row.qty),
      picked: Number(row.picked) === 1,
    });
  }

  const categories = Array.from(grouped.values());
  const totalItems = categories.reduce((sum, group) => sum + group.items.length, 0);
  const pickedItems = categories.reduce((sum, group) => sum + group.items.filter((item) => item.picked).length, 0);
  return {
    generatedAt: nowTs(),
    categories,
    totalItems,
    pickedItems,
    allPicked: totalItems > 0 && pickedItems === totalItems,
  };
}

export async function toggleCarryPicked(productId) {
  const row = await get(`SELECT qty, picked FROM carry_order_items WHERE product_id = ?`, [Number(productId)]);
  if (!row || Number(row.qty || 0) <= 0) throw new HttpError(400, 'Товар отсутствует в заявке');
  const next = Number(row.picked || 0) === 1 ? 0 : 1;
  await run(`UPDATE carry_order_items SET picked = ?, updated_at = ? WHERE product_id = ?`, [
    next,
    nowTs(),
    Number(productId),
  ]);
  return next === 1;
}

export async function completeCarryOrder(userId) {
  await run(`DELETE FROM carry_order_items`);
  await run(`DELETE FROM carry_category_confirmations`);
  await logUserAction(userId, 'complete_order', { module: 'carry' });
}
