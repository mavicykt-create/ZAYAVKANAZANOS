const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Get current user stats
router.get('/me', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;
  const today = new Date().toISOString().split('T')[0];

  const stats = db.prepare(`
    SELECT * FROM user_daily_stats
    WHERE user_id = ? AND date = ?
  `).get(userId, today);

  res.json(stats || {
    carry_categories: 0,
    product_changes: 0,
    price_categories: 0,
    marks: 0,
    prints: 0,
    mistakes: 0,
    score: 0
  });
});

// Get monthly rating (admin only)
router.get('/rating', requireAuth, requireAdmin, (req, res) => {
  const { month, year } = req.query;
  const db = getDB();

  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-31`;

  const stats = db.prepare(`
    SELECT 
      u.id,
      u.login,
      SUM(uds.carry_categories * 10 + 
          uds.product_changes * 1 + 
          uds.price_categories * 8 + 
          uds.marks * 1 + 
          uds.prints * 2 - 
          uds.mistakes * 5) as total_score,
      SUM(uds.carry_categories) as carry_categories,
      SUM(uds.price_categories) as price_categories,
      SUM(uds.marks) as marks
    FROM users u
    LEFT JOIN user_daily_stats uds ON u.id = uds.user_id
    WHERE uds.date BETWEEN ? AND ?
    GROUP BY u.id, u.login
    ORDER BY total_score DESC
  `).all(startDate, endDate);

  res.json(stats);
});

// Get user actions log (admin only)
router.get('/actions', requireAuth, requireAdmin, (req, res) => {
  const { userId, limit = 100 } = req.query;
  const db = getDB();

  let query = `
    SELECT ual.*, u.login
    FROM user_actions_log ual
    JOIN users u ON ual.user_id = u.id
  `;
  let params = [];

  if (userId) {
    query += ' WHERE ual.user_id = ?';
    params.push(userId);
  }

  query += ' ORDER BY ual.created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const actions = db.prepare(query).all(...params);
  res.json(actions);
});

module.exports = router;
