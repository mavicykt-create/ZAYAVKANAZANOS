const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { awardScore, getScoreboard, getUserHistory, getWeights, updateWeight } = require('../services/scoreService');
const router = express.Router();

// ===== РЕЙТИНГ (админ) =====

router.get('/scoreboard', requireAuth, requireAdmin, (req, res) => {
  const { startDate, endDate } = req.query;
  const today = new Date().toISOString().split('T')[0];
  const data = getScoreboard(startDate || today, endDate || today);
  res.json(data);
});

// История баллов пользователя (админ)
router.get('/history/:userId', requireAuth, requireAdmin, (req, res) => {
  const history = getUserHistory(req.params.userId, 200);
  res.json(history);
});

// Моя история баллов (любой пользователь)
router.get('/my-history', requireAuth, (req, res) => {
  const history = getUserHistory(req.session.userId, 100);
  res.json(history);
});

// Мои баллы по корзинам (любой пользователь)
router.get('/my-baskets', requireAuth, (req, res) => {
  const { getDB } = require('../services/database');
  const db = getDB();
  const userId = req.session.userId;
  const today = new Date().toISOString().split('T')[0];

  const baskets = db.prepare(`
    SELECT basket, SUM(points) as total, COUNT(*) as actions,
           SUM(CASE WHEN points > 0 THEN points ELSE 0 END) as positive,
           SUM(CASE WHEN points < 0 THEN points ELSE 0 END) as negative
    FROM score_history
    WHERE user_id = ? AND date(created_at) = ?
    GROUP BY basket
  `).all(userId, today);

  const grandTotal = db.prepare(`
    SELECT SUM(points) as total FROM score_history WHERE user_id = ? AND date(created_at) = ?
  `).get(userId, today);

  const streak = db.prepare('SELECT * FROM score_streaks WHERE user_id = ?').get(userId);

  res.json({ baskets, grandTotal: grandTotal?.total || 0, streak: streak || { consecutive_on_time_days: 0, total_multiplier: 1.0 } });
});

// Веса (админ — чтение/запись, сотрудник — только чтение)
router.get('/weights', requireAuth, (req, res) => {
  const weights = getWeights();
  res.json(weights);
});

router.put('/weights/:id', requireAuth, requireAdmin, (req, res) => {
  updateWeight(req.params.id, req.body);
  res.json({ success: true });
});

// Ручное начисление баллов (админ)
router.post('/award', requireAuth, requireAdmin, (req, res) => {
  const { userId, actionType, entityId, label } = req.body;
  const result = awardScore(userId, actionType, { entityId, label });
  res.json(result);
});

// Массовый отчёт за период (админ)
router.get('/report', requireAuth, requireAdmin, (req, res) => {
  const { startDate, endDate } = req.query;
  const today = new Date().toISOString().split('T')[0];
  const s = startDate || today;
  const e = endDate || today;

  const { getDB } = require('../services/database');
  const db = getDB();

  const users = db.prepare(`
    SELECT 
      sh.user_id,
      sh.user_name,
      SUM(sh.points) as grand_total,
      SUM(CASE WHEN sh.basket = 'productivity' THEN sh.points ELSE 0 END) as productivity,
      SUM(CASE WHEN sh.basket = 'quality' THEN sh.points ELSE 0 END) as quality,
      SUM(CASE WHEN sh.basket = 'initiative' THEN sh.points ELSE 0 END) as initiative,
      SUM(CASE WHEN sh.basket = 'discipline' THEN sh.points ELSE 0 END) as discipline,
      SUM(CASE WHEN sh.basket = 'bonus' THEN sh.points ELSE 0 END) as bonus,
      SUM(CASE WHEN sh.points > 0 THEN sh.points ELSE 0 END) as total_positive,
      SUM(CASE WHEN sh.points < 0 THEN sh.points ELSE 0 END) as total_negative,
      COUNT(*) as total_actions
    FROM score_history sh
    WHERE date(sh.created_at) BETWEEN ? AND ?
    GROUP BY sh.user_id
    ORDER BY grand_total DESC
  `).all(s, e);

  const streaks = db.prepare('SELECT * FROM score_streaks').all();
  const streakMap = {};
  streaks.forEach(st => streakMap[st.user_id] = st);

  res.json({ period: { start: s, end: e }, users, streakMap });
});

module.exports = router;
