const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

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

module.exports = router;