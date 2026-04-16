import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logAction } from '../services/statsService.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT i.id, i.name, i.vendor_code, c.name AS category_name
    FROM catalog_items i
    JOIN categories c ON c.id = i.category_id
    WHERE (i.barcode IS NULL OR trim(i.barcode) = '')
      AND i.hidden_from_product_check = 0
    ORDER BY c.id, i.sort_name ASC, i.name ASC
  `).all();
  res.json({ ok: true, items: rows });
});

router.post('/:itemId/hide', (req, res) => {
  const itemId = Number(req.params.itemId);
  db.prepare(`UPDATE catalog_items SET hidden_from_product_check = 1 WHERE id = ?`).run(itemId);
  logAction(req.user.id, 'product_check_hide', { itemId });
  res.json({ ok: true });
});

export default router;
