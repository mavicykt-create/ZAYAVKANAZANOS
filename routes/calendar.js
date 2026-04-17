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

// ===== TO-DO ЗАДАЧИ =====

// Get todo items for date
router.get('/todos', requireAuth, (req, res) => {
  const { date } = req.query;
  const db = getDB();

  const items = db.prepare(`
    SELECT * FROM todo_items
    WHERE date = ?
    ORDER BY created_at
  `).all(date);

  res.json(items);
});

// Get all todo items for date range
router.get('/todos-range', requireAuth, (req, res) => {
  const { startDate, endDate } = req.query;
  const db = getDB();

  const items = db.prepare(`
    SELECT * FROM todo_items
    WHERE date BETWEEN ? AND ?
    ORDER BY date, created_at
  `).all(startDate, endDate);

  res.json(items);
});

// Create todo item (admin only)
router.post('/todos', requireAuth, requireAdmin, (req, res) => {
  const { date, title, description } = req.body;
  const db = getDB();

  const result = db.prepare(`
    INSERT INTO todo_items (date, title, description)
    VALUES (?, ?, ?)
  `).run(date, title, description);

  res.json({ id: result.lastInsertRowid, success: true });
});

// Toggle todo completion (any user)
router.post('/todos/:id/toggle', requireAuth, (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId;
  const db = getDB();

  // Get current state
  const todo = db.prepare('SELECT * FROM todo_items WHERE id = ?').get(id);
  if (!todo) {
    return res.status(404).json({ error: 'Задача не найдена' });
  }

  // Get user name
  const user = db.prepare('SELECT login FROM users WHERE id = ?').get(userId);

  if (todo.is_completed) {
    // Uncomplete
    db.prepare(`
      UPDATE todo_items
      SET is_completed = 0, completed_by = NULL, completed_by_name = NULL, completed_at = NULL
      WHERE id = ?
    `).run(id);
  } else {
    // Complete
    db.prepare(`
      UPDATE todo_items
      SET is_completed = 1, completed_by = ?, completed_by_name = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId, user.login, id);
  }

  res.json({ success: true });
});

// Delete todo item (admin only)
router.delete('/todos/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const db = getDB();

  db.prepare('DELETE FROM todo_items WHERE id = ?').run(id);

  res.json({ success: true });
});

module.exports = router;
