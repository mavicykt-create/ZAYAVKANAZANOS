const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/categories', requireAuth, (req, res) => {
  const db = getDB();
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  res.json(categories);
});

router.get('/products', requireAuth, (req, res) => {
  const { category } = req.query;
  const db = getDB();
  const products = db.prepare(`
    SELECT id, external_id, category_id, name, vendor_code,
      picture, price, barcode, stock_quantity
    FROM products
    WHERE category_id = ?
    ORDER BY name
  `).all(category);
  res.json(products);
});

module.exports = router;