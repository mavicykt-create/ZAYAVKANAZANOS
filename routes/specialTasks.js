const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '../data/special-tasks-uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ===== СПЕЦ ЗАДАНИЯ =====

// Создать спец задание
router.post('/', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;
  const { description, complexity } = req.body;

  const user = db.prepare('SELECT login FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  if (!description || description.trim() === '') {
    return res.status(400).json({ error: 'Опишите задачу' });
  }

  const result = db.prepare(`
    INSERT INTO special_tasks (user_id, user_name, description, complexity)
    VALUES (?, ?, ?, ?)
  `).run(userId, user.login, description.trim(), complexity || 3);

  res.json({ id: result.lastInsertRowid, success: true });
});

// Получить мои спец задания
router.get('/my', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;

  const tasks = db.prepare(`
    SELECT * FROM special_tasks 
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);

  res.json(tasks);
});

// Получить все спец задания (админ)
router.get('/all', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();

  const tasks = db.prepare(`
    SELECT st.*, u.login
    FROM special_tasks st
    JOIN users u ON st.user_id = u.id
    ORDER BY st.created_at DESC
  `).all();

  res.json(tasks);
});

// Загрузить фото к спец заданию
router.post('/:id/photo', requireAuth, (req, res) => {
  const db = getDB();
  const taskId = req.params.id;
  const userId = req.session.userId;

  // Проверяем что задание принадлежит пользователю
  const task = db.prepare('SELECT * FROM special_tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
  if (!task) {
    return res.status(403).json({ error: 'Задание не найдено или нет доступа' });
  }

  const { fileData, fileType, fileName } = req.body;
  if (!fileData) {
    return res.status(400).json({ error: 'Нет данных файла' });
  }

  const ext = path.extname(fileName) || '.jpg';
  const safeName = `special_${taskId}_${Date.now()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, safeName);

  const buffer = Buffer.from(fileData.split(',')[1] || fileData, 'base64');
  fs.writeFileSync(filePath, buffer);

  const relativePath = `/data/special-tasks-uploads/${safeName}`;

  db.prepare('UPDATE special_tasks SET photo_path = ? WHERE id = ?').run(relativePath, taskId);

  res.json({ success: true, path: relativePath });
});

// Админ: обновить статус и комментарий
router.post('/:id/resolve', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();
  const taskId = req.params.id;
  const adminId = req.session.userId;
  const { status, comment } = req.body;

  if (!status || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Укажите статус: approved или rejected' });
  }

  db.prepare(`
    UPDATE special_tasks 
    SET status = ?, admin_comment = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
    WHERE id = ?
  `).run(status, comment || '', adminId, taskId);

  res.json({ success: true });
});

// ===== ШКАЛА СЛОЖНОСТИ =====

// Получить шкалу сложности
router.get('/scale', requireAuth, (req, res) => {
  const db = getDB();
  const scale = db.prepare('SELECT * FROM complexity_scale ORDER BY level').all();
  res.json(scale);
});

// Обновить шкалу сложности (админ)
router.put('/scale/:level', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();
  const { label } = req.body;
  const level = req.params.level;

  db.prepare(`
    INSERT OR REPLACE INTO complexity_scale (level, label, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(level, label);

  res.json({ success: true });
});

module.exports = router;
