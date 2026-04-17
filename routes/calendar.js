const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Get items for date range
router.get('/items', requireAuth, (req, res) => {
  const { startDate, endDate } = req.query;
  const db = getDB();

  const items = db.prepare(`
    SELECT * FROM weekly_calendar_items
    WHERE date BETWEEN ? AND ?
    ORDER BY date, created_at
  `).all(startDate, endDate);

  res.json(items);
});

// Create item (admin only)
router.post('/items', requireAuth, requireAdmin, (req, res) => {
  const { date, title, text } = req.body;
  const db = getDB();

  const result = db.prepare(`
    INSERT INTO weekly_calendar_items (date, title, text)
    VALUES (?, ?, ?)
  `).run(date, title, text);

  res.json({ id: result.lastInsertRowid, success: true });
});

// Update item (admin only)
router.put('/items/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { date, title, text } = req.body;
  const db = getDB();

  db.prepare(`
    UPDATE weekly_calendar_items
    SET date = ?, title = ?, text = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(date, title, text, id);

  res.json({ success: true });
});

// Delete item (admin only)
router.delete('/items/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const db = getDB();

  db.prepare('DELETE FROM weekly_calendar_items WHERE id = ?').run(id);

  res.json({ success: true });
});

module.exports = router;
