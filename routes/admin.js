/**
 * ZAN 1.1 - Admin Routes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../services/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Overview stats
router.get('/overview', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();

  // Online users (logged in last 5 minutes)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60000).toISOString();
  const onlineUsers = db.prepare(`
    SELECT COUNT(*) as count FROM users 
    WHERE last_login_at > ?
  `).get(fiveMinutesAgo).count;

  // Total products
  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;

  // Products without barcode
  const missingBarcodes = db.prepare(`
    SELECT COUNT(*) as count FROM products 
    WHERE (barcode IS NULL OR barcode = '') AND hidden_from_product_check = 0
  `).get().count;

  // Sync status
  const syncStatus = db.prepare('SELECT * FROM sync_status WHERE id = 1').get();

  res.json({
    onlineUsers,
    totalProducts,
    missingBarcodes,
    syncStatus
  });
});

// Users CRUD
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();
  const users = db.prepare(`
    SELECT id, login, role, is_active, last_login_at, created_at
    FROM users
    ORDER BY created_at DESC
  `).all();
  res.json(users);
});

router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const { login, password, role } = req.body;
  const db = getDB();

  const hash = bcrypt.hashSync(password, 10);

  try {
    const result = db.prepare(`
      INSERT INTO users (login, password_hash, role)
      VALUES (?, ?, ?)
    `).run(login, hash, role);

    res.json({ id: result.lastInsertRowid, success: true });
  } catch (e) {
    res.status(400).json({ error: 'Login already exists' });
  }
});

router.put('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { login, role, is_active, password } = req.body;
  const db = getDB();

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  }

  db.prepare(`
    UPDATE users SET login = ?, role = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(login, role, is_active ? 1 : 0, id);

  res.json({ success: true });
});

router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const db = getDB();

  // Prevent deleting yourself
  if (parseInt(id) === req.session.userId) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

// Get locks
router.get('/locks', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();

  const locks = db.prepare(`
    SELECT pcp.*, c.name as category_name, u.login as locked_by_name
    FROM price_check_pages pcp
    JOIN categories c ON pcp.category_id = c.id
    JOIN users u ON pcp.locked_by = u.id
    WHERE pcp.locked_by IS NOT NULL
  `).all();

  res.json(locks);
});

// Force unlock
router.post('/force-unlock', requireAuth, requireAdmin, (req, res) => {
  const { categoryId, pageNumber } = req.body;
  const db = getDB();

  db.prepare(`
    UPDATE price_check_pages 
    SET locked_by = NULL, locked_at = NULL
    WHERE category_id = ? AND page_number = ?
  `).run(categoryId, pageNumber);

  res.json({ success: true });
});

// Get problematic products
router.get('/problematic', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();

  const products = db.prepare(`
    SELECT p.name, p.vendor_code, c.name as category_name,
           pci.has_problem, pci.price_checked, u.login as checked_by,
           pci.checked_at
    FROM price_check_items pci
    JOIN price_check_pages pcp ON pci.page_id = pcp.id
    JOIN products p ON pci.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN users u ON pci.checked_by = u.id
    WHERE pci.has_problem = 1
    ORDER BY pci.checked_at DESC
  `).all();

  res.json(products);
});

module.exports = router;
