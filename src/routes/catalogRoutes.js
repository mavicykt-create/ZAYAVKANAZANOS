import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getSyncStatus, resetSyncStatus, runCatalogSync } from '../services/syncService.js';

const router = Router();
router.use(requireAuth);

router.get('/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, COUNT(i.id) AS item_count
    FROM categories c
    LEFT JOIN catalog_items i ON i.category_id = c.id
    GROUP BY c.id, c.name
    ORDER BY c.id
  `).all();
  res.json({ ok: true, categories: rows });
});

router.get('/items', (req, res) => {
  const categoryId = Number(req.query.categoryId);
  const rows = db.prepare(`
    SELECT i.id, i.category_id, i.name, i.vendor_code, i.picture, i.picture_cached, i.barcode,
           i.stock_quantity, i.price,
           COALESCE(ci.quantity, 0) AS quantity
    FROM catalog_items i
    LEFT JOIN carry_items ci
      ON ci.item_id = i.id AND ci.user_id = ?
    WHERE i.category_id = ?
    ORDER BY i.sort_name ASC, i.name ASC
  `).all(req.user.id, categoryId);
  res.json({ ok: true, items: rows });
});

router.get('/sync-status', (req, res) => {
  res.json({ ok: true, status: getSyncStatus() });
});

router.post('/sync', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false, message: 'admin only' });
  const result = await runCatalogSync();
  res.json(result);
});

router.post('/sync/reset', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false, message: 'admin only' });
  res.json({ ok: true, status: resetSyncStatus() });
});

export default router;
