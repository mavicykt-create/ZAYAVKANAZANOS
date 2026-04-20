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

// ===== TO-DO ЗАДАЧИ С ТАЙМЕРОМ =====

// Get todo items for date
router.get('/todos', requireAuth, (req, res) => {
  const { date } = req.query;
  const userId = req.session.userId;
  const db = getDB();

  // Проверяем истёкшие таймеры перед выдачей
  checkExpiredTimers(db);

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

  checkExpiredTimers(db);

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

// Get today's active todos for main screen
router.get('/todos-today-active', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const db = getDB();
  const today = new Date().toISOString().split('T')[0];

  checkExpiredTimers(db);

  const items = db.prepare(`
    SELECT ti.*, GROUP_CONCAT(ta.user_id) as assignee_ids
    FROM todo_items ti
    LEFT JOIN todo_assignees ta ON ti.id = ta.todo_id
    WHERE ti.date = ? AND ti.is_completed = 0 AND ti.timer_expired = 0
    GROUP BY ti.id
    HAVING assignee_ids IS NULL OR assignee_ids LIKE ?
    ORDER BY 
      CASE WHEN ti.timer_deadline_at IS NOT NULL THEN 0 ELSE 1 END,
      ti.timer_deadline_at ASC,
      ti.created_at
  `).all(today, `%${userId}%`);

  res.json(items);
});

// Check and mark expired timers
function checkExpiredTimers(db) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE todo_items
    SET timer_expired = 1, is_completed = 0
    WHERE timer_deadline_at IS NOT NULL 
      AND timer_deadline_at < ? 
      AND timer_expired = 0
      AND is_completed = 0
  `).run(now);
}

// Get all todos for admin (without filtering)
router.get('/todos-all', requireAuth, requireAdmin, (req, res) => {
  const { startDate, endDate } = req.query;
  const db = getDB();

  checkExpiredTimers(db);

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

// Create todo item (admin only) - с возможностью назначения сотрудников и таймера
router.post('/todos', requireAuth, requireAdmin, (req, res) => {
  const { date, title, description, assigneeIds, timerHours } = req.body;
  const db = getDB();

  // Вычисляем deadline если указан таймер
  let timerDeadlineAt = null;
  let timerStartedAt = null;
  const hours = parseInt(timerHours) || 0;
  
  if (hours > 0) {
    timerStartedAt = new Date().toISOString();
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + hours);
    timerDeadlineAt = deadline.toISOString();
  }

  const result = db.prepare(`
    INSERT INTO todo_items (date, title, description, timer_hours, timer_started_at, timer_deadline_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(date, title, description, hours, timerStartedAt, timerDeadlineAt);

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

  // Проверяем не истёк ли таймер
  if (todo.timer_deadline_at && !todo.is_completed) {
    const now = new Date();
    const deadline = new Date(todo.timer_deadline_at);
    if (now > deadline) {
      // Помечаем как просроченную
      db.prepare(`
        UPDATE todo_items
        SET timer_expired = 1
        WHERE id = ?
      `).run(id);
      return res.status(400).json({ 
        error: 'Время на выполнение истекло! Задача просрочена.',
        expired: true 
      });
    }
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

    // Баллы за инициативу
    const { awardScore } = require('../services/scoreService');
    awardScore(userId, 'todo_completed', { entityId: id, label: todo.title });
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
    WHERE ti.is_completed = 0 AND ti.date <= date('now') AND ti.timer_expired = 0
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
