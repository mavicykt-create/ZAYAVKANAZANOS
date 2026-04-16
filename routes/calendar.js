const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/events', requireAuth, (req, res) => {
  const { week } = req.query;
  const db = getDB();
  const startDate = new Date(week);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  const events = db.prepare(`
    SELECT * FROM weekly_calendar_items
    WHERE date BETWEEN ? AND ?
    ORDER BY date, created_at
  `).all(startDate.toISOString(), endDate.toISOString());

  res.json(events);
});

router.post('/events', requireAuth, requireAdmin, (req, res) => {
  const { date, title, description } = req.body;
  const db = getDB();
  const result = db.prepare(`
    INSERT INTO weekly_calendar_items (date, title, text)
    VALUES (?, ?, ?)
  `).run(date, title, description);
  res.json({ id: result.lastInsertRowid, success: true });
});

router.delete('/events/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const db = getDB();
  db.prepare('DELETE FROM weekly_calendar_items WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;