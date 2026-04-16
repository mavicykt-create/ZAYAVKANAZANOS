const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/assembly', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;
  const items = db.prepare(`
    SELECT cr.id, cr.quantity, cr.product_id, cr.category_id,
      p.name as product_name, p.vendor_code, p.picture,
      c.name as category_name
    FROM carry_requests cr
    JOIN products p ON cr.product_id = p.id
    JOIN categories c ON cr.category_id = c.id
    WHERE cr.user_id = ? AND cr.status = 'pending' AND cr.quantity > 0
    ORDER BY c.name, p.name
  `).all(userId);
  res.json(items);
});

router.post('/assembly', requireAuth, (req, res) => {
  const { productId, quantity } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  const existing = db.prepare(`
    SELECT id FROM carry_requests
    WHERE user_id = ? AND product_id = ? AND status = 'pending'
  `).get(userId, productId);

  if (existing) {
    if (quantity <= 0) {
      db.prepare('DELETE FROM carry_requests WHERE id = ?').run(existing.id);
    } else {
      db.prepare('UPDATE carry_requests SET quantity = ? WHERE id = ?')
        .run(quantity, existing.id);
    }
  } else if (quantity > 0) {
    const product = db.prepare('SELECT category_id FROM products WHERE id = ?').get(productId);
    db.prepare(`
      INSERT INTO carry_requests (user_id, category_id, product_id, quantity)
      VALUES (?, ?, ?, ?)
    `).run(userId, product.category_id, productId, quantity);
  }

  res.json({ success: true });
});

router.delete('/assembly', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;
  db.prepare('DELETE FROM carry_requests WHERE user_id = ? AND status = "pending"').run(userId);
  res.json({ success: true });
});

module.exports = router;