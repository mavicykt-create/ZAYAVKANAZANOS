const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const ITEMS_PER_PAGE = 50;

// Get pages for category
router.get('/pages/:categoryId', requireAuth, (req, res) => {
  const { categoryId } = req.params;
  const db = getDB();
  const userId = req.session.userId;

  // Get total products count
  const count = db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?').get(categoryId).count;
  const totalPages = Math.ceil(count / ITEMS_PER_PAGE);

  // Get pages with lock status
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    const page = db.prepare(`
      SELECT pcp.*, u.login as locked_by_name
      FROM price_check_pages pcp
      LEFT JOIN users u ON pcp.locked_by = u.id
      WHERE pcp.category_id = ? AND pcp.page_number = ?
    `).get(categoryId, i);

    pages.push({
      pageNumber: i,
      lockedBy: page?.locked_by_name || null,
      lockedById: page?.locked_by || null,
      lockedAt: page?.locked_at || null,
      isLocked: !!page?.locked_by && page.locked_by !== userId
    });
  }

  res.json({ pages, totalPages, totalItems: count });
});

// Lock page
router.post('/lock-page', requireAuth, (req, res) => {
  const { categoryId, pageNumber } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  // Check if already locked by someone else
  const existing = db.prepare(`
    SELECT locked_by FROM price_check_pages 
    WHERE category_id = ? AND page_number = ?
  `).get(categoryId, pageNumber);

  if (existing && existing.locked_by && existing.locked_by !== userId) {
    return res.status(403).json({ error: 'Page is locked by another user' });
  }

  // Insert or update lock
  db.prepare(`
    INSERT INTO price_check_pages (category_id, page_number, locked_by, locked_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(category_id, page_number) DO UPDATE SET
    locked_by = excluded.locked_by,
    locked_at = excluded.locked_at
  `).run(categoryId, pageNumber, userId);

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
  const userId = req.session.userId;
  const db = getDB();

  // Check lock
  const lock = db.prepare(`
    SELECT locked_by FROM price_check_pages 
    WHERE category_id = ? AND page_number = ?
  `).get(categoryId, pageNumber);

  if (lock && lock.locked_by && lock.locked_by !== userId) {
    return res.status(403).json({ error: 'Page is locked by another user' });
  }

  const offset = (parseInt(pageNumber) - 1) * ITEMS_PER_PAGE;

  const products = db.prepare(`
    SELECT p.id, p.name, p.vendor_code, p.picture, p.price,
           pci.has_problem, pci.price_checked
    FROM products p
    LEFT JOIN price_check_pages pcp ON pcp.category_id = p.category_id
    LEFT JOIN price_check_items pci ON pci.page_id = pcp.id AND pci.product_id = p.id
    WHERE p.category_id = ?
    ORDER BY p.name
    LIMIT ? OFFSET ?
  `).all(categoryId, ITEMS_PER_PAGE, offset);

  res.json(products);
});

// Toggle problem
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
      INSERT INTO price_check_pages (category_id, page_number, locked_by, locked_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(categoryId, pageNumber, userId);
    page = { id: result.lastInsertRowid };
  }

  // Toggle
  const existing = db.prepare(`
    SELECT id, has_problem FROM price_check_items WHERE page_id = ? AND product_id = ?
  `).get(page.id, productId);

  if (existing) {
    db.prepare(`
      UPDATE price_check_items SET has_problem = ?, checked_by = ?, checked_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(existing.has_problem ? 0 : 1, userId, existing.id);
  } else {
    db.prepare(`
      INSERT INTO price_check_items (page_id, product_id, has_problem, checked_by, checked_at)
      VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
    `).run(page.id, productId, userId);
  }

  // Log action
  db.prepare('INSERT INTO user_actions_log (user_id, action_type, details) VALUES (?, ?, ?)')
    .run(userId, 'toggle_problem', JSON.stringify({ productId }));

  updateUserStats(userId, 'marks');

  res.json({ success: true });
});

// Toggle price checked
router.post('/toggle-price', requireAuth, (req, res) => {
  const { categoryId, pageNumber, productId } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  let page = db.prepare(`
    SELECT id FROM price_check_pages WHERE category_id = ? AND page_number = ?
  `).get(categoryId, pageNumber);

  if (!page) {
    const result = db.prepare(`
      INSERT INTO price_check_pages (category_id, page_number, locked_by, locked_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(categoryId, pageNumber, userId);
    page = { id: result.lastInsertRowid };
  }

  const existing = db.prepare(`
    SELECT id, price_checked FROM price_check_items WHERE page_id = ? AND product_id = ?
  `).get(page.id, productId);

  if (existing) {
    db.prepare(`
      UPDATE price_check_items SET price_checked = ?, checked_by = ?, checked_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(existing.price_checked ? 0 : 1, userId, existing.id);
  } else {
    db.prepare(`
      INSERT INTO price_check_items (page_id, product_id, price_checked, checked_by, checked_at)
      VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
    `).run(page.id, productId, userId);
  }

  // Log action
  db.prepare('INSERT INTO user_actions_log (user_id, action_type, details) VALUES (?, ?, ?)')
    .run(userId, 'toggle_price', JSON.stringify({ productId }));

  updateUserStats(userId, 'marks');

  res.json({ success: true });
});

// Get print data
router.get('/print/:categoryId', requireAuth, (req, res) => {
  const { categoryId } = req.params;
  const db = getDB();

  const items = db.prepare(`
    SELECT p.name, p.vendor_code,
           CASE WHEN pci.has_problem = 1 THEN 'Проблема'
                WHEN pci.price_checked = 1 THEN 'Ценник'
                ELSE '' END as status
    FROM price_check_items pci
    JOIN price_check_pages pcp ON pci.page_id = pcp.id
    JOIN products p ON pci.product_id = p.id
    WHERE pcp.category_id = ? AND (pci.has_problem = 1 OR pci.price_checked = 1)
    ORDER BY p.name
  `).all(categoryId);

  res.json({
    date: new Date().toLocaleString('ru-RU'),
    items
  });
});

function updateUserStats(userId, field) {
  const db = getDB();
  const today = new Date().toISOString().split('T')[0];

  db.prepare(`
    INSERT INTO user_daily_stats (user_id, date, ${field})
    VALUES (?, ?, 1)
    ON CONFLICT(user_id, date) DO UPDATE SET
    ${field} = ${field} + 1
  `).run(userId, today);
}

module.exports = router;
