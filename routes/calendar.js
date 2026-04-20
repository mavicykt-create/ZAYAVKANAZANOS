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
  const userId = req.session.userId;
  const db = getDB();

  // Получаем задачи: общие (без назначенных) + назначенные текущему пользователю
  const items = db.prepare(`
    SELECT ti.*, GROUP_CONCAT(ta.user_id) as assignee_ids
    FROM todo_items ti
    LEFT JOIN todo_assignees ta ON ti.id = ta.todo_id
    WHERE ti.date = ?
    GROUP BY ti.id
    HAVING assignee_ids IS NULL OR assignee_ids LIKE ?
    ORDER BY ti.created_at
  `).all(date, `%${userId}%`);

  res.json(items);
});

// Get all todo items for date range
router.get('/todos-range', requireAuth, (req, res) => {
  const { startDate, endDate } = req.query;
  const userId = req.session.userId;
  const db = getDB();

  const items = db.prepare(`
    SELECT ti.*, GROUP_CONCAT(ta.user_id) as assignee_ids
    FROM todo_items ti
    LEFT JOIN todo_assignees ta ON ti.id = ta.todo_id
    WHERE ti.date BETWEEN ? AND ?
    GROUP BY ti.id
    HAVING assignee_ids IS NULL OR assignee_ids LIKE ?
    ORDER BY ti.date, ti.created_at
  `).all(startDate, endDate, `%${userId}%`);

  res.json(items);
});

// Get all todos for admin (without filtering)
router.get('/todos-all', requireAuth, requireAdmin, (req, res) => {
  const { startDate, endDate } = req.query;
  const db = getDB();

  const items = db.prepare(`
    SELECT ti.*, GROUP_CONCAT(ta.user_id) as assignee_ids
    FROM todo_items ti
    LEFT JOIN todo_assignees ta ON ti.id = ta.todo_id
    WHERE ti.date BETWEEN ? AND ?
    GROUP BY ti.id
    ORDER BY ti.date, ti.created_at
  `).all(startDate, endDate);

  res.json(items);
});

// Create todo item (admin only) - с возможностью назначения сотрудников
router.post('/todos', requireAuth, requireAdmin, (req, res) => {
  const { date, title, description, assigneeIds } = req.body;
  const db = getDB();

  const result = db.prepare(`
    INSERT INTO todo_items (date, title, description)
    VALUES (?, ?, ?)
  `).run(date, title, description);

  const todoId = result.lastInsertRowid;

  // Назначаем сотрудников если указаны
  if (assigneeIds && assigneeIds.length > 0) {
    const insertAssignee = db.prepare('INSERT INTO todo_assignees (todo_id, user_id) VALUES (?, ?)');
    assigneeIds.forEach(uid => {
      insertAssignee.run(todoId, uid);
    });
  }

  res.json({ id: todoId, success: true });
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

  // Удаляем назначения
  db.prepare('DELETE FROM todo_assignees WHERE todo_id = ?').run(id);
  // Удаляем задачу
  db.prepare('DELETE FROM todo_items WHERE id = ?').run(id);

  res.json({ success: true });
});

// ===== ПРОВЕРКА НЕЗАКРЫТЫХ ЗАДАЧ =====

// Получить даты с незакрытыми задачами
router.get('/pending-dates', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const db = getDB();

  const items = db.prepare(`
    SELECT ti.date, COUNT(*) as pending_count
    FROM todo_items ti
    LEFT JOIN todo_assignees ta ON ti.id = ta.todo_id
    WHERE ti.is_completed = 0 AND ti.date <= date('now')
    GROUP BY ti.id
    HAVING (SELECT COUNT(*) FROM todo_assignees WHERE todo_id = ti.id) = 0 
        OR (SELECT COUNT(*) FROM todo_assignees WHERE todo_id = ti.id AND user_id = ?) > 0
    ORDER BY ti.date
  `).all(userId);

  const pendingDates = {};
  items.forEach(item => {
    if (!pendingDates[item.date]) pendingDates[item.date] = 0;
    pendingDates[item.date]++;
  });

  res.json(pendingDates);
});

module.exports = router;
