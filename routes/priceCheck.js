const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const ITEMS_PER_PAGE = 50;

router.get('/pages', requireAuth, (req, res) => {
  const db = getDB();
  const count = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const totalPages = Math.ceil(count / ITEMS_PER_PAGE);

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    pages.push({ pageNumber: i, lockedBy: null });
  }
  res.json({ pages, locks: [] });
});

router.get('/products', requireAuth, (req, res) => {
  const { page } = req.query;
  const db = getDB();
  const offset = (parseInt(page) - 1) * ITEMS_PER_PAGE;

  const products = db.prepare(`
    SELECT id, name, vendor_code, picture, price
    FROM products
    ORDER BY name
    LIMIT ? OFFSET ?
  `).all(ITEMS_PER_PAGE, offset);

  res.json({ products });
});

module.exports = router;