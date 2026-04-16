/**
 * ZAN 1.1 - Price Check Routes
 */

const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const PRODUCTS_PER_PAGE = 50;

// Get pages for category
router.get('/pages/:categoryId', requireAuth, (req, res) => {
  const { categoryId } = req.params;
  const db = getDB();
  const userId = req.session.userId;

  // Get total products count
  const { count } = db.prepare(`
    SELECT COUNT(*) as count FROM products WHERE category_id = ?
  `).get(categoryId);

  const totalPages = Math.ceil(count / PRODUCTS_PER_PAGE);

  // Get page statuses
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    const page = db.prepare(`
      SELECT pcp.*, u.login as locked_by_name
      FROM price_check_pages pcp
      LEFT JOIN users u ON pcp.locked_by = u.id
      WHERE pcp.category_id = ? AND pcp.page_number = ?
    `).get(categoryId, i);

    if (!page) {
      // Create page record if not exists
      db.prepare(`
        INSERT INTO price_check_pages (category_id, page_number)
        VALUES (?, ?)
      `).run(categoryId, i);
      
      pages.push({
        pageNumber: i,
        isLocked: false,
        lockedBy: null,
        lockedById: null
      });
    } else {
      // Check if lock is expired (5 minutes)
      const isExpired = page.locked_at && 
        (new Date() - new Date(page.locked_at)) > 5 * 60 * 1000;
      
      if (isExpired && page.locked_by) {
        db.prepare(`
          UPDATE price_check_pages SET locked_by = NULL, locked_at = NULL
          WHERE id = ?
        `).run(page.id);
        page.locked_by = null;
      }

      pages.push({
        pageNumber: i,
        isLocked: !!page.locked_by && page.locked_by !== userId,
        lockedBy: page.locked_by_name,
        lockedById: page.locked_by
      });
    }
  }

  res.json({ pages, totalProducts: count });
});

// Lock page
router.post('/lock-page', requireAuth, (req, res) => {
  const { categoryId, pageNumber } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  // Check if already locked by someone else
  const existing = db.prepare(`
    SELECT locked_by, locked_at FROM price_check_pages
    WHERE category_id = ? AND page_number = ?
  `).get(categoryId, pageNumber);

  if (existing?.locked_by && existing.locked_by !== userId) {
    const isExpired = (new Date() - new Date(existing.locked_at)) > 5 * 60 * 1000;
    if (!isExpired) {
      return res.status(409).json({ error: 'Page is locked by another user' });
    }
  }

  db.prepare(`
    UPDATE price_check_pages 
    SET locked_by = ?, locked_at = CURRENT_TIMESTAMP
    WHERE category_id = ? AND page_number = ?
  `).run(userId, categoryId, pageNumber);

  res.json({ success: true });
});

// Unlock page
router.post('/unlock-page', requireAuth, (req, res) => {
  const { categoryId, pageNumber } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  db.prepare(`
    UPDATE price_check_pages 
    SET locked_by = NULL, locked_at = NULL
    WHERE category_id = ? AND page_number = ? AND locked_by = ?
  `).run(categoryId, pageNumber, userId);

  res.json({ success: true });
});

// Get products for page
router.get('/products/:categoryId/:pageNumber', requireAuth, (req, res) => {
  const { categoryId, pageNumber } = req.params;
  const db = getDB();
  const offset = (pageNumber - 1) * PRODUCTS_PER_PAGE;

  const products = db.prepare(`
    SELECT p.*, 
           COALESCE(pci.has_problem, 0) as has_problem,
           COALESCE(pci.price_checked, 0) as price_checked
    FROM products p
    LEFT JOIN price_check_pages pcp ON pcp.category_id = p.category_id AND pcp.page_number = ?
    LEFT JOIN price_check_items pci ON pci.page_id = pcp.id AND pci.product_id = p.id
    WHERE p.category_id = ?
    ORDER BY p.name
    LIMIT ? OFFSET ?
  `).all(pageNumber, categoryId, PRODUCTS_PER_PAGE, offset);

  res.json(products);
});

// Toggle problem status
router.post('/toggle-problem', requireAuth, (req, res) => {
  const { categoryId, pageNumber, productId } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  // Get or create page
  let page = db.prepare(`
    SELECT id FROM price_check_pages WHERE category_id = ? AND page_number = ?
  `).get(categoryId, pageNumber);

  if (!page) {
    const result = db.prepare(`
      INSERT INTO price_check_pages (category_id, page_number, locked_by)
      VALUES (?, ?, ?)
    `).run(categoryId, pageNumber, userId);
    page = { id: result.lastInsertRowid };
  }

  // Toggle problem
  const existing = db.prepare(`
    SELECT has_problem FROM price_check_items WHERE page_id = ? AND product_id = ?
  `).get(page.id, productId);

  if (existing) {
    db.prepare(`
      UPDATE price_check_items 
      SET has_problem = NOT has_problem, checked_by = ?, checked_at = CURRENT_TIMESTAMP
      WHERE page_id = ? AND product_id = ?
    `).run(userId, page.id, productId);
  } else {
    db.prepare(`
      INSERT INTO price_check_items (page_id, product_id, has_problem, checked_by, checked_at)
      VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
    `).run(page.id, productId, userId);
  }

  res.json({ success: true });
});

// Toggle price checked status
router.post('/toggle-price', requireAuth, (req, res) => {
  const { categoryId, pageNumber, productId } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  // Get or create page
  let page = db.prepare(`
    SELECT id FROM price_check_pages WHERE category_id = ? AND page_number = ?
  `).get(categoryId, pageNumber);

  if (!page) {
    const result = db.prepare(`
      INSERT INTO price_check_pages (category_id, page_number, locked_by)
      VALUES (?, ?, ?)
    `).run(categoryId, pageNumber, userId);
    page = { id: result.lastInsertRowid };
  }

  // Toggle price check
  const existing = db.prepare(`
    SELECT price_checked FROM price_check_items WHERE page_id = ? AND product_id = ?
  `).get(page.id, productId);

  if (existing) {
    db.prepare(`
      UPDATE price_check_items 
      SET price_checked = NOT price_checked, checked_by = ?, checked_at = CURRENT_TIMESTAMP
      WHERE page_id = ? AND product_id = ?
    `).run(userId, page.id, productId);
  } else {
    db.prepare(`
      INSERT INTO price_check_items (page_id, product_id, price_checked, checked_by, checked_at)
      VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
    `).run(page.id, productId, userId);
  }

  res.json({ success: true });
});

module.exports = router;
