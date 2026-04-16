import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getCarryStep } from '../utils/step.js';
import { nowIso } from '../utils/time.js';
import { logAction } from '../services/statsService.js';

const router = Router();
router.use(requireAuth);

router.get('/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name,
           COUNT(i.id) AS item_count,
           COALESCE(SUM(ci.quantity), 0) AS total_qty
    FROM categories c
    LEFT JOIN catalog_items i ON i.category_id = c.id
    LEFT JOIN carry_items ci ON ci.item_id = i.id AND ci.user_id = ?
    GROUP BY c.id, c.name
    ORDER BY c.id
  `).all(req.user.id);
  res.json({ ok: true, categories: rows });
});

router.get('/category/:categoryId', (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const rows = db.prepare(`
    SELECT i.id, i.category_id, i.name, i.vendor_code,
           COALESCE(i.picture_cached, i.picture, '') AS picture_url,
           COALESCE(ci.quantity, 0) AS quantity
    FROM catalog_items i
    LEFT JOIN carry_items ci ON ci.item_id = i.id AND ci.user_id = ?
    WHERE i.category_id = ?
    ORDER BY i.sort_name ASC, i.name ASC
  `).all(req.user.id, categoryId);
  res.json({ ok: true, items: rows });
});

router.post('/item/:itemId/increment', (req, res) => {
  const itemId = Number(req.params.itemId);
  const item = db.prepare(`SELECT id, category_id, name FROM catalog_items WHERE id = ?`).get(itemId);
  if (!item) return res.status(404).json({ ok: false, message: 'item not found' });

  const existing = db.prepare(`SELECT quantity FROM carry_items WHERE user_id = ? AND item_id = ?`).get(req.user.id, itemId);
  const step = getCarryStep(item.name);
  const quantity = (existing?.quantity || 0) + step;
  db.prepare(`
    INSERT INTO carry_items (user_id, category_id, item_id, quantity, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at
  `).run(req.user.id, item.category_id, itemId, quantity, nowIso());
  logAction(req.user.id, 'increment', { itemId, step });
  res.json({ ok: true, quantity, step });
});

router.post('/item/:itemId/decrement', (req, res) => {
  const itemId = Number(req.params.itemId);
  const item = db.prepare(`SELECT id, category_id, name FROM catalog_items WHERE id = ?`).get(itemId);
  if (!item) return res.status(404).json({ ok: false, message: 'item not found' });

  const existing = db.prepare(`SELECT quantity FROM carry_items WHERE user_id = ? AND item_id = ?`).get(req.user.id, itemId);
  const step = getCarryStep(item.name);
  const quantity = Math.max(0, (existing?.quantity || 0) - step);
  if (quantity === 0) {
    db.prepare(`DELETE FROM carry_items WHERE user_id = ? AND item_id = ?`).run(req.user.id, itemId);
  } else {
    db.prepare(`
      INSERT INTO carry_items (user_id, category_id, item_id, quantity, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at
    `).run(req.user.id, item.category_id, itemId, quantity, nowIso());
  }
  logAction(req.user.id, 'decrement', { itemId, step });
  res.json({ ok: true, quantity, step });
});

router.post('/category/:categoryId/confirm', (req, res) => {
  const categoryId = Number(req.params.categoryId);
  db.prepare(`
    INSERT INTO carry_category_completions (user_id, category_id, completed_at)
    VALUES (?, ?, ?)
  `).run(req.user.id, categoryId, nowIso());
  logAction(req.user.id, 'complete_category', { categoryId });
  res.json({ ok: true });
});

router.get('/order', (req, res) => {
  const rows = db.prepare(`
    SELECT c.name AS category_name, i.name, i.vendor_code, ci.quantity
    FROM carry_items ci
    JOIN catalog_items i ON i.id = ci.item_id
    JOIN categories c ON c.id = i.category_id
    WHERE ci.user_id = ? AND ci.quantity > 0
    ORDER BY c.id, i.sort_name ASC, i.name ASC
  `).all(req.user.id);

  const grouped = [];
  let current = null;
  for (const row of rows) {
    if (!current || current.category !== row.category_name) {
      current = { category: row.category_name, items: [] };
      grouped.push(current);
    }
    current.items.push(row);
  }

  res.json({
    ok: true,
    print: {
      date: new Date().toLocaleDateString('ru-RU'),
      time: new Date().toLocaleTimeString('ru-RU'),
      categories: grouped
    }
  });
});

router.post('/order/complete', (req, res) => {
  logAction(req.user.id, 'complete_order', {});
  res.json({ ok: true });
});

router.post('/order/item/:itemId/check', (req, res) => {
  const itemId = Number(req.params.itemId);
  const existing = db.prepare(`SELECT is_checked FROM carry_items WHERE user_id = ? AND item_id = ?`).get(req.user.id, itemId);
  if (!existing) return res.status(404).json({ ok: false, message: 'not in order' });
  const nextValue = existing.is_checked ? 0 : 1;
  db.prepare(`UPDATE carry_items SET is_checked = ?, updated_at = ? WHERE user_id = ? AND item_id = ?`)
    .run(nextValue, nowIso(), req.user.id, itemId);
  res.json({ ok: true, is_checked: !!nextValue });
});

export default router;
