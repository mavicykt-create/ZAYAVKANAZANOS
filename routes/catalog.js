/**
 * ZAN 1.1 - Catalog Routes
 */

const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Get all categories
router.get('/categories', requireAuth, (req, res) => {
  const db = getDB();
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  res.json(categories);
});

// Get products by category
router.get('/products/:categoryId', requireAuth, (req, res) => {
  const { categoryId } = req.params;
  const db = getDB();

  const products = db.prepare(`
    SELECT id, external_id, category_id, name, vendor_code, 
           picture, price, barcode, stock_quantity
    FROM products 
    WHERE category_id = ?
    ORDER BY name
  `).all(categoryId);

  res.json(products);
});

// Search products
router.get('/search', requireAuth, (req, res) => {
  const { q } = req.query;
  const db = getDB();

  const products = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.name LIKE ? OR p.vendor_code LIKE ? OR p.barcode LIKE ?
    LIMIT 50
  `).all(`%${q}%`, `%${q}%`, `%${q}%`);

  res.json(products);
});

// Get product by barcode
router.get('/barcode/:barcode', requireAuth, (req, res) => {
  const { barcode } = req.params;
  const db = getDB();

  const product = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.barcode = ?
  `).get(barcode);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json(product);
});

module.exports = router;
