import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { nowIso } from '../utils/time.js';
import { logAction } from '../services/statsService.js';

const router = Router();
router.use(requireAuth);

function buildPagesForCategory(categoryId) {
  const countRow = db.prepare(`SELECT COUNT(*) AS count FROM catalog_items WHERE category_id = ?`).get(categoryId);
  const pageCount = Math.max(1, Math.ceil((countRow?.count || 0) / 50));
  for (let page = 1; page <= pageCount; page += 1) {
    db.prepare(`
      INSERT INTO price_check_pages (category_id, page_number, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(category_id, page_number) DO NOTHING
    `).run(categoryId, page, nowIso());
  }
}

router.get('/pages', (req, res) => {
  const categories = db.prepare(`SELECT id, name FROM categories ORDER BY id`).all();
  const result = categories.map(c => {
    buildPagesForCategory(c.id);
    const pages = db.prepare(`
      SELECT p.category_id, p.page_number, p.locked_at,
             u.login AS locked_by_login,
             (
               SELECT COUNT(*)
               FROM catalog_items i
               WHERE i.category_id = p.category_id
             ) AS total_items
      FROM price_check_pages p
      LEFT JOIN users u ON u.id = p.locked_by
      WHERE p.category_id = ?
      ORDER BY p.page_number
    `).all(c.id);
    return { category: c, pages };
  });
  res.json({ ok: true, groups: result });
});

router.post('/page/open', (req, res) => {
  const { categoryId, pageNumber } = req.body || {};
  buildPagesForCategory(categoryId);
  const page = db.prepare(`
    SELECT p.*, u.login AS locked_by_login
    FROM price_check_pages p
    LEFT JOIN users u ON u.id = p.locked_by
    WHERE p.category_id = ? AND p.page_number = ?
  `).get(categoryId, pageNumber);

  if (page.locked_by && page.locked_by !== req.user.id) {
    return res.status(409).json({ ok: false, message: `Занято: ${page.locked_by_login || 'сотрудник'}` });
  }

  db.prepare(`
    UPDATE price_check_pages
    SET locked_by = ?, locked_at = ?, updated_at = ?
    WHERE category_id = ? AND page_number = ?
  `).run(req.user.id, nowIso(), nowIso(), categoryId, pageNumber);

  const offset = (Number(pageNumber) - 1) * 50;
  const items = db.prepare(`
    SELECT i.id, i.name, i.vendor_code, COALESCE(i.picture_cached, i.picture, '') AS picture_url,
           COALESCE(m.status_problem, 0) AS status_problem,
           COALESCE(m.status_price, 0) AS status_price
    FROM catalog_items i
    LEFT JOIN price_check_marks m ON m.item_id = i.id AND m.user_id = ?
    WHERE i.category_id = ?
    ORDER BY i.sort_name ASC, i.name ASC
    LIMIT 50 OFFSET ?
  `).all(req.user.id, categoryId, offset);

  res.json({ ok: true, items });
});

router.post('/page/close', (req, res) => {
  const { categoryId, pageNumber, completed } = req.body || {};
  db.prepare(`
    UPDATE price_check_pages
    SET locked_by = NULL, locked_at = NULL, updated_at = ?
    WHERE category_id = ? AND page_number = ? AND locked_by = ?
  `).run(nowIso(), categoryId, pageNumber, req.user.id);
  if (completed) logAction(req.user.id, 'price_page_complete', { categoryId, pageNumber });
  res.json({ ok: true });
});

router.post('/item/:itemId/toggle', (req, res) => {
  const itemId = Number(req.params.itemId);
  const field = req.body?.field;
  if (!['status_problem', 'status_price'].includes(field)) {
    return res.status(400).json({ ok: false, message: 'bad field' });
  }
  const current = db.prepare(`SELECT * FROM price_check_marks WHERE user_id = ? AND item_id = ?`).get(req.user.id, itemId);
  const next = current ? (current[field] ? 0 : 1) : 1;

  db.prepare(`
    INSERT INTO price_check_marks (user_id, item_id, status_problem, status_price, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, item_id) DO UPDATE SET
      status_problem = excluded.status_problem,
      status_price = excluded.status_price,
      updated_at = excluded.updated_at
  `).run(
    req.user.id,
    itemId,
    field === 'status_problem' ? next : (current?.status_problem || 0),
    field === 'status_price' ? next : (current?.status_price || 0),
    nowIso()
  );

  logAction(req.user.id, field === 'status_problem' ? 'toggle_problem' : 'toggle_price', { itemId, value: next });
  res.json({ ok: true, [field]: !!next });
});

router.get('/print', (req, res) => {
  const rows = db.prepare(`
    SELECT i.name, i.vendor_code,
           CASE
             WHEN m.status_problem = 1 THEN 'Проблема'
             WHEN m.status_price = 1 THEN 'Ценник'
             ELSE ''
           END AS status
    FROM price_check_marks m
    JOIN catalog_items i ON i.id = m.item_id
    WHERE m.user_id = ? AND (m.status_problem = 1 OR m.status_price = 1)
    ORDER BY i.sort_name ASC, i.name ASC
  `).all(req.user.id);
  logAction(req.user.id, 'print', { module: 'price-check', count: rows.length });
  res.json({ ok: true, rows });
});

export default router;
