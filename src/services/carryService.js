import { getDb } from '../db/connection.js';
import { logAction } from './statsService.js';
import { HttpError } from '../utils/httpError.js';

function getStepByName(name) {
  return /(^|\s)1\s*\/\s*\d+/i.test(name) ? 5 : 1;
}

export async function getCarryCategoryState(userId, categoryId) {
  const db = await getDb();
  const products = await db.all(
    `SELECT p.id, p.name, p.vendor_code, p.picture_cached,
            COALESCE(e.qty, 0) AS qty
     FROM products p
     LEFT JOIN carry_entries e
       ON e.product_id = p.id AND e.user_id = ? AND e.category_id = ?
     WHERE p.category_id = ?
     ORDER BY COALESCE(p.sort_name, p.name) ASC`,
    [userId, categoryId, categoryId]
  );
  return products.map((item) => ({ ...item, step: getStepByName(item.name) }));
}

export async function changeCarryQty({ userId, categoryId, productId, direction }) {
  const db = await getDb();
  const product = await db.get('SELECT id, name FROM products WHERE id = ? AND category_id = ?', [productId, categoryId]);
  if (!product) throw new HttpError(404, 'Товар не найден');
  const step = getStepByName(product.name);
  const current = await db.get(
    'SELECT qty FROM carry_entries WHERE user_id = ? AND category_id = ? AND product_id = ?',
    [userId, categoryId, productId]
  );
  const prevQty = current?.qty || 0;
  const nextQty = Math.max(0, prevQty + (direction === 'inc' ? step : -step));
  await db.run(
    `INSERT INTO carry_entries (user_id, category_id, product_id, qty, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, category_id, product_id)
     DO UPDATE SET qty = excluded.qty, updated_at = CURRENT_TIMESTAMP`,
    [userId, categoryId, productId, nextQty]
  );
  await logAction({ userId, action: direction === 'inc' ? 'increment' : 'decrement', module: 'carry', entityId: String(productId), payload: { categoryId, step, prevQty, nextQty } });
  return { productId, qty: nextQty, step };
}

export async function completeCarryCategory(userId, categoryId) {
  const db = await getDb();
  await db.run('INSERT INTO carry_category_completions (user_id, category_id) VALUES (?, ?)', [userId, categoryId]);
  await logAction({ userId, action: 'complete_category', module: 'carry', entityId: String(categoryId) });
}

export async function getCarryAssembly(userId) {
  const db = await getDb();
  return db.all(`
    SELECT c.id AS category_id, c.name AS category_name, p.id AS product_id, p.name, p.vendor_code, e.qty
    FROM carry_entries e
    JOIN products p ON p.id = e.product_id
    JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ? AND e.qty > 0
    ORDER BY c.sort_order, COALESCE(p.sort_name, p.name)
  `, [userId]);
}

export async function completeCarryOrder(userId) {
  const db = await getDb();
  await db.run('INSERT INTO carry_order_completions (user_id) VALUES (?)', [userId]);
  await logAction({ userId, action: 'complete_order', module: 'carry' });
}
