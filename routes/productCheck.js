const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/products', requireAuth, (req, res) => {
  const db = getDB();
  const products = db.prepare(`
    SELECT p.id, p.name, p.vendor_code, p.category_id, c.name as category_name
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE (p.barcode IS NULL OR p.barcode = '')
    AND p.hidden_from_product_check = 0
    ORDER BY c.name, p.name
  `).all();
  res.json(products);
});

router.post('/hide/:productId', requireAuth, (req, res) => {
  const { productId } = req.params;
  const db = getDB();
  db.prepare('UPDATE products SET hidden_from_product_check = 1 WHERE id = ?').run(productId);
  res.json({ success: true });
});

module.exports = router;