import { all, get, run } from '../../db.js';
import { config } from '../config.js';
import { nowTs } from '../utils/format.js';
import { HttpError } from '../utils/http.js';
import { logUserAction } from './actionLogService.js';

const PAGE_SIZE = 50;

async function releaseExpiredPageLocks() {
  const cutoff = nowTs() - config.lockTtlMs;
  await run(
    `UPDATE price_check_pages SET locked_by = NULL, locked_at = NULL
     WHERE locked_by IS NOT NULL AND locked_at IS NOT NULL AND locked_at < ?`,
    [cutoff],
  );
}

export async function getPriceCheckCategoriesWithPages() {
  await releaseExpiredPageLocks();
  const rows = await all(
    `SELECT c.id AS categoryId, c.name AS categoryName, c.sort_order AS sortOrder,
            COUNT(p.id) AS productsCount
     FROM catalog_categories c
     LEFT JOIN catalog_products p ON p.category_id = c.id
     GROUP BY c.id, c.name, c.sort_order
     ORDER BY c.sort_order ASC, c.id ASC`,
  );
  return rows.map((item) => {
    const productsCount = Number(item.productsCount || 0);
    const pagesCount = Math.max(1, Math.ceil(productsCount / PAGE_SIZE));
    return {
      categoryId: Number(item.categoryId),
      categoryName: item.categoryName,
      pagesCount,
      pages: Array.from({ length: pagesCount }, (_, idx) => ({ pageNumber: idx + 1 })),
    };
  });
}

export async function listPriceCheckPages(categoryId, currentUserId) {
  await releaseExpiredPageLocks();
  const row = await get(
    `SELECT COUNT(*) AS productsCount FROM catalog_products WHERE category_id = ?`,
    [Number(categoryId)],
  );
  const productsCount = Number(row?.productsCount || 0);
  const pagesCount = Math.max(1, Math.ceil(productsCount / PAGE_SIZE));
  const pages = await all(
    `SELECT p.category_id AS categoryId, p.page_number AS pageNumber, p.locked_by AS lockedBy,
            p.locked_at AS lockedAt, p.completed_at AS completedAt, u.login AS lockedByLogin
     FROM price_check_pages p
     LEFT JOIN users u ON u.id = p.locked_by
     WHERE p.category_id = ?
     ORDER BY p.page_number ASC`,
    [Number(categoryId)],
  );
  const byNumber = new Map(pages.map((item) => [Number(item.pageNumber), item]));
  return Array.from({ length: pagesCount }, (_, index) => {
    const pageNumber = index + 1;
    const item = byNumber.get(pageNumber);
    return {
      categoryId: Number(categoryId),
      pageNumber,
      lockedBy: item?.lockedBy ? Number(item.lockedBy) : null,
      lockedByLogin: item?.lockedByLogin || null,
      lockedAt: item?.lockedAt ? Number(item.lockedAt) : null,
      completedAt: item?.completedAt ? Number(item.completedAt) : null,
      isLockedByMe: item?.lockedBy ? Number(item.lockedBy) === Number(currentUserId) : false,
    };
  });
}

async function ensurePageExists(categoryId, pageNumber) {
  const pages = await listPriceCheckPages(categoryId, null);
  const target = pages.find((item) => Number(item.pageNumber) === Number(pageNumber));
  if (!target) throw new HttpError(404, 'Страница не найдена');
}

export async function lockPriceCheckPage(categoryId, pageNumber, userId) {
  await releaseExpiredPageLocks();
  await ensurePageExists(categoryId, pageNumber);
  const page = await get(
    `SELECT locked_by AS lockedBy FROM price_check_pages WHERE category_id = ? AND page_number = ?`,
    [Number(categoryId), Number(pageNumber)],
  );
  if (page?.lockedBy && Number(page.lockedBy) !== Number(userId)) {
    const holder = await get(`SELECT login FROM users WHERE id = ?`, [Number(page.lockedBy)]);
    throw new HttpError(409, `Занято: ${holder?.login || 'другой сотрудник'}`);
  }
  await run(
    `INSERT INTO price_check_pages (category_id, page_number, locked_by, locked_at, completed_by, completed_at)
     VALUES (?, ?, ?, ?, NULL, NULL)
     ON CONFLICT(category_id, page_number) DO UPDATE SET
       locked_by = excluded.locked_by,
       locked_at = excluded.locked_at`,
    [Number(categoryId), Number(pageNumber), Number(userId), nowTs()],
  );
}

export async function unlockPriceCheckPage(categoryId, pageNumber, userId, isAdmin = false) {
  await ensurePageExists(categoryId, pageNumber);
  const page = await get(
    `SELECT locked_by AS lockedBy FROM price_check_pages WHERE category_id = ? AND page_number = ?`,
    [Number(categoryId), Number(pageNumber)],
  );
  if (!page) return;
  if (page.lockedBy && Number(page.lockedBy) !== Number(userId) && !isAdmin) {
    throw new HttpError(403, 'Страница занята другим сотрудником');
  }
  await run(
    `UPDATE price_check_pages
     SET locked_by = NULL, locked_at = NULL
     WHERE category_id = ? AND page_number = ?`,
    [Number(categoryId), Number(pageNumber)],
  );
}

export async function heartbeatPriceCheckPage(categoryId, pageNumber, userId) {
  const result = await run(
    `UPDATE price_check_pages SET locked_at = ?
     WHERE category_id = ? AND page_number = ? AND locked_by = ?`,
    [nowTs(), Number(categoryId), Number(pageNumber), Number(userId)],
  );
  if (result.changes === 0) throw new HttpError(409, 'Блокировка потеряна');
}

async function assertPageLock(categoryId, pageNumber, userId) {
  const row = await get(
    `SELECT locked_by AS lockedBy FROM price_check_pages WHERE category_id = ? AND page_number = ?`,
    [Number(categoryId), Number(pageNumber)],
  );
  if (!row) throw new HttpError(409, 'Сначала займите страницу');
  if (!row.lockedBy || Number(row.lockedBy) !== Number(userId)) {
    throw new HttpError(409, 'Сначала займите страницу');
  }
}

export async function getPriceCheckPageProducts(categoryId, pageNumber, userId) {
  await ensurePageExists(categoryId, pageNumber);
  await assertPageLock(categoryId, pageNumber, userId);
  const offset = (Number(pageNumber) - 1) * PAGE_SIZE;
  const products = await all(
    `SELECT p.id, p.name, p.vendor_code AS vendorCode, p.picture, p.cached_image AS cachedImage,
            COALESCE(i.problem_flag, 0) AS problemFlag, COALESCE(i.price_flag, 0) AS priceFlag
     FROM catalog_products p
     LEFT JOIN price_check_items i ON i.product_id = p.id
     WHERE p.category_id = ?
     ORDER BY p.name COLLATE NOCASE ASC
     LIMIT ? OFFSET ?`,
    [Number(categoryId), PAGE_SIZE, offset],
  );
  return products.map((item) => ({
    id: Number(item.id),
    name: item.name,
    vendorCode: item.vendorCode,
    picture: item.picture || '',
    cachedImage: item.cachedImage || '',
    problem: Number(item.problemFlag) === 1,
    price: Number(item.priceFlag) === 1,
  }));
}

async function pageNumberForProduct(categoryId, productId) {
  const products = await all(
    `SELECT id FROM catalog_products WHERE category_id = ? ORDER BY name COLLATE NOCASE ASC`,
    [Number(categoryId)],
  );
  const index = products.findIndex((item) => Number(item.id) === Number(productId));
  if (index === -1) throw new HttpError(404, 'Товар не найден в категории');
  return Math.floor(index / PAGE_SIZE) + 1;
}

async function toggleFlag(userId, productId, fieldName, actionName) {
  const product = await get(`SELECT id, category_id AS categoryId FROM catalog_products WHERE id = ?`, [Number(productId)]);
  if (!product) throw new HttpError(404, 'Товар не найден');
  const pageNumber = await pageNumberForProduct(product.categoryId, productId);
  await assertPageLock(product.categoryId, pageNumber, userId);

  const current = await get(
    `SELECT problem_flag AS problemFlag, price_flag AS priceFlag FROM price_check_items WHERE product_id = ?`,
    [Number(productId)],
  );
  const nextProblem = fieldName === 'problem_flag'
    ? (Number(current?.problemFlag || 0) === 1 ? 0 : 1)
    : Number(current?.problemFlag || 0);
  const nextPrice = fieldName === 'price_flag'
    ? (Number(current?.priceFlag || 0) === 1 ? 0 : 1)
    : Number(current?.priceFlag || 0);

  if (nextProblem === 0 && nextPrice === 0) {
    await run(`DELETE FROM price_check_items WHERE product_id = ?`, [Number(productId)]);
  } else {
    await run(
      `INSERT INTO price_check_items (product_id, problem_flag, price_flag, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET
         problem_flag = excluded.problem_flag,
         price_flag = excluded.price_flag,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
      [Number(productId), nextProblem, nextPrice, Number(userId), nowTs()],
    );
  }

  await logUserAction(userId, actionName, {
    module: 'price_check',
    entityId: String(productId),
    payload: { problem: nextProblem === 1, price: nextPrice === 1 },
  });

  return { problem: nextProblem === 1, price: nextPrice === 1 };
}

export async function togglePriceProblem(userId, productId) {
  return toggleFlag(userId, productId, 'problem_flag', 'toggle_problem');
}

export async function togglePriceTag(userId, productId) {
  return toggleFlag(userId, productId, 'price_flag', 'toggle_price');
}

export async function completePriceCheckPage(userId, categoryId, pageNumber) {
  await assertPageLock(categoryId, pageNumber, userId);
  await run(
    `UPDATE price_check_pages
     SET completed_by = ?, completed_at = ?, locked_by = NULL, locked_at = NULL
     WHERE category_id = ? AND page_number = ?`,
    [Number(userId), nowTs(), Number(categoryId), Number(pageNumber)],
  );
  await logUserAction(userId, 'complete_category', {
    module: 'price_check',
    entityId: `${categoryId}:${pageNumber}`,
    scoreDelta: 8,
  });
}

export async function getPriceCheckReportRows() {
  const rows = await all(
    `SELECT p.id, p.name, p.vendor_code AS vendorCode,
            i.problem_flag AS problemFlag, i.price_flag AS priceFlag
     FROM price_check_items i
     JOIN catalog_products p ON p.id = i.product_id
     WHERE i.problem_flag = 1 OR i.price_flag = 1
     ORDER BY p.name COLLATE NOCASE ASC`,
  );
  return rows.map((item) => ({
    id: Number(item.id),
    name: item.name,
    vendorCode: item.vendorCode,
    problem: Number(item.problemFlag) === 1,
    price: Number(item.priceFlag) === 1,
    status: [Number(item.problemFlag) === 1 ? 'Проблема' : '', Number(item.priceFlag) === 1 ? 'Ценник' : '']
      .filter(Boolean)
      .join(', '),
  }));
}

export async function getLockedPricePages() {
  await releaseExpiredPageLocks();
  const rows = await all(
    `SELECT p.category_id AS categoryId, c.name AS categoryName, p.page_number AS pageNumber,
            p.locked_by AS lockedBy, p.locked_at AS lockedAt, u.login AS lockedByLogin
     FROM price_check_pages p
     JOIN catalog_categories c ON c.id = p.category_id
     LEFT JOIN users u ON u.id = p.locked_by
     WHERE p.locked_by IS NOT NULL
     ORDER BY p.locked_at ASC`,
  );
  return rows.map((item) => ({
    categoryId: Number(item.categoryId),
    categoryName: item.categoryName,
    pageNumber: Number(item.pageNumber),
    lockedBy: Number(item.lockedBy),
    lockedByLogin: item.lockedByLogin || '',
    lockedAt: Number(item.lockedAt || 0) || null,
  }));
}
