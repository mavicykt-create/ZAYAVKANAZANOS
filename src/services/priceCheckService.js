import { getDb } from '../db/connection.js';
import { HttpError } from '../utils/httpError.js';
import { logAction } from './statsService.js';

const PAGE_SIZE = 50;

export async function getPriceCheckPages() {
  const db = await getDb();
  const categories = await db.all('SELECT id, name, sort_order FROM categories ORDER BY sort_order');
  const result = [];
  for (const category of categories) {
    const countRow = await db.get('SELECT COUNT(*) AS count FROM products WHERE category_id = ?', [category.id]);
    const pages = Math.max(1, Math.ceil((countRow?.count || 0) / PAGE_SIZE));
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      await db.run(
        `INSERT OR IGNORE INTO price_check_pages (category_id, page_number) VALUES (?, ?)`,
        [category.id, pageNumber]
      );
    }
    const pageRows = await db.all(
      `SELECT pcp.category_id, pcp.page_number, pcp.locked_by, pcp.locked_at, u.login AS locked_by_login
       FROM price_check_pages pcp
       LEFT JOIN users u ON u.id = pcp.locked_by
       WHERE pcp.category_id = ?
       ORDER BY pcp.page_number`,
      [category.id]
    );
    result.push({ category, pages: pageRows });
  }
  return result;
}

export async function openPriceCheckPage({ userId, categoryId, pageNumber }) {
  const db = await getDb();
  const page = await db.get(
    `SELECT pcp.*, u.login AS locked_by_login
     FROM price_check_pages pcp
     LEFT JOIN users u ON u.id = pcp.locked_by
     WHERE category_id = ? AND page_number = ?`,
    [categoryId, pageNumber]
  );
  if (!page) throw new HttpError(404, 'Страница не найдена');
  if (page.locked_by && page.locked_by !== userId) throw new HttpError(409, `Занято: ${page.locked_by_login || 'другой сотрудник'}`);
  if (!page.locked_by) {
    await db.run(
      'UPDATE price_check_pages SET locked_by = ?, locked_at = CURRENT_TIMESTAMP WHERE category_id = ? AND page_number = ?',
      [userId, categoryId, pageNumber]
    );
  }

  const offset = (pageNumber - 1) * PAGE_SIZE;
  const items = await db.all(
    `SELECT p.id, p.name, p.vendor_code, p.picture_cached,
            COALESCE(m.is_problem, 0) AS is_problem,
            COALESCE(m.is_price_tag, 0) AS is_price_tag
     FROM products p
     LEFT JOIN price_check_marks m ON m.product_id = p.id
     WHERE p.category_id = ?
     ORDER BY COALESCE(p.sort_name, p.name) ASC
     LIMIT ? OFFSET ?`,
    [categoryId, PAGE_SIZE, offset]
  );
  return { items };
}

export async function togglePriceCheckMark({ userId, productId, markType }) {
  const db = await getDb();
  const current = await db.get('SELECT * FROM price_check_marks WHERE product_id = ?', [productId]);
  const isProblem = markType === 'problem' ? (current?.is_problem ? 0 : 1) : (current?.is_problem || 0);
  const isPriceTag = markType === 'price' ? (current?.is_price_tag ? 0 : 1) : (current?.is_price_tag || 0);

  await db.run(
    `INSERT INTO price_check_marks (user_id, product_id, is_problem, is_price_tag, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(product_id)
     DO UPDATE SET user_id = excluded.user_id, is_problem = excluded.is_problem, is_price_tag = excluded.is_price_tag, updated_at = CURRENT_TIMESTAMP`,
    [userId, productId, isProblem, isPriceTag]
  );
  await logAction({ userId, action: markType === 'problem' ? 'toggle_problem' : 'toggle_price', module: 'price-check', entityId: String(productId), payload: { isProblem, isPriceTag } });
  return { productId, isProblem, isPriceTag };
}

export async function releasePriceCheckPage({ userId, categoryId, pageNumber }) {
  const db = await getDb();
  const page = await db.get('SELECT locked_by FROM price_check_pages WHERE category_id = ? AND page_number = ?', [categoryId, pageNumber]);
  if (!page) throw new HttpError(404, 'Страница не найдена');
  if (page.locked_by && page.locked_by !== userId) throw new HttpError(403, 'Нельзя освободить чужую страницу');
  await db.run('UPDATE price_check_pages SET locked_by = NULL, locked_at = NULL WHERE category_id = ? AND page_number = ?', [categoryId, pageNumber]);
  await logAction({ userId, action: 'complete_price_page', module: 'price-check', entityId: `${categoryId}:${pageNumber}` });
}

export async function problemItems() {
  const db = await getDb();
  return db.all(`
    SELECT p.name, p.vendor_code, c.name AS category_name, m.is_problem, m.is_price_tag, m.updated_at
    FROM price_check_marks m
    JOIN products p ON p.id = m.product_id
    JOIN categories c ON c.id = p.category_id
    WHERE m.is_problem = 1 OR m.is_price_tag = 1
    ORDER BY m.updated_at DESC
  `);
}
