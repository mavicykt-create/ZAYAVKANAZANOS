/**
 * ZAN 1.1 - Carry Request Routes
 */

const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Get carry requests for user
router.get('/requests', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;

  const requests = db.prepare(`
    SELECT cr.*, p.name as product_name, p.vendor_code, p.picture,
           c.name as category_name
    FROM carry_requests cr
    JOIN products p ON cr.product_id = p.id
    JOIN categories c ON cr.category_id = c.id
    WHERE cr.user_id = ? AND cr.status = 'pending'
    ORDER BY cr.created_at DESC
  `).all(userId);

  res.json(requests);
});

// Add/update carry request
router.post('/request', requireAuth, (req, res) => {
  const { categoryId, productId, quantity } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  // Check if request exists
  const existing = db.prepare(`
    SELECT id, quantity FROM carry_requests 
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
    db.prepare(`
      INSERT INTO carry_requests (user_id, category_id, product_id, quantity)
      VALUES (?, ?, ?, ?)
    `).run(userId, categoryId, productId, quantity);
  }

  // Log action
  const actionType = quantity > (existing?.quantity || 0) ? 'increment' : 'decrement';
  db.prepare('INSERT INTO user_actions_log (user_id, action_type, details) VALUES (?, ?, ?)')
    .run(userId, actionType, JSON.stringify({ productId, quantity }));

  res.json({ success: true, quantity });
});

// Complete category
router.post('/complete-category', requireAuth, (req, res) => {
  const { categoryId } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  db.prepare(`
    UPDATE carry_requests 
    SET status = 'completed', completed_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND category_id = ? AND status = 'pending'
  `).run(userId, categoryId);

  // Log action
  db.prepare('INSERT INTO user_actions_log (user_id, action_type, details) VALUES (?, ?, ?)')
    .run(userId, 'complete_category', JSON.stringify({ categoryId }));

  // Update stats
  updateUserStats(userId, 'carry_categories');

  res.json({ success: true });
});

// Get assembly list - all pending requests
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

// Mark items as collected
router.post('/mark-collected', requireAuth, (req, res) => {
  const { requestIds } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  const stmt = db.prepare(`
    UPDATE carry_requests SET status = 'collected'
    WHERE id = ? AND user_id = ?
  `);

  requestIds.forEach(id => {
    stmt.run(id, userId);
  });

  res.json({ success: true });
});

// Complete order
router.post('/complete-order', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const db = getDB();

  db.prepare(`
    UPDATE carry_requests 
    SET status = 'completed', completed_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND status = 'collected'
  `).run(userId);

  // Log action
  db.prepare('INSERT INTO user_actions_log (user_id, action_type) VALUES (?, ?)')
    .run(userId, 'complete_order');

  res.json({ success: true });
});

// Get print data for category
router.get('/print/:categoryId', requireAuth, (req, res) => {
  const { categoryId } = req.params;
  const userId = req.session.userId;
  const db = getDB();

  const items = db.prepare(`
    SELECT cr.quantity, p.name, p.vendor_code, c.name as category_name
    FROM carry_requests cr
    JOIN products p ON cr.product_id = p.id
    JOIN categories c ON cr.category_id = c.id
    WHERE cr.user_id = ? AND cr.category_id = ? AND cr.status = 'pending'
    ORDER BY p.name
  `).all(userId, categoryId);

  res.json({
    date: new Date().toLocaleString('ru-RU'),
    category: items[0]?.category_name || '',
    items
  });
});

// Get ALL print data (all categories) - for assembly
router.get('/print-all', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const db = getDB();

  const items = db.prepare(`
    SELECT cr.quantity, p.name, p.vendor_code, c.name as category_name
    FROM carry_requests cr
    JOIN products p ON cr.product_id = p.id
    JOIN categories c ON cr.category_id = c.id
    WHERE cr.user_id = ? AND cr.status = 'pending' AND cr.quantity > 0
    ORDER BY c.name, p.name
  `).all(userId);

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
