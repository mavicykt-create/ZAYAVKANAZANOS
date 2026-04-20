const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const AVATAR_DIR = path.join(__dirname, '../data/avatars');
const DOCS_DIR = path.join(__dirname, '../data/user-documents');

if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });
if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

// ===== ПРОФИЛЬ =====

// Получить свой профиль
router.get('/', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;

  const user = db.prepare('SELECT id, login, role, created_at FROM users WHERE id = ?').get(userId);
  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);

  res.json({
    ...user,
    profile: profile || null
  });
});

// Обновить профиль
router.put('/', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;
  const { phone, email, bio } = req.body;

  db.prepare(`
    INSERT OR REPLACE INTO user_profiles (user_id, phone, email, bio, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(userId, phone || null, email || null, bio || null);

  res.json({ success: true });
});

// Загрузить аватар
router.post('/avatar', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;
  const { fileData, fileName } = req.body;

  if (!fileData) return res.status(400).json({ error: 'Нет данных файла' });

  const ext = path.extname(fileName) || '.jpg';
  const safeName = `avatar_${userId}_${Date.now()}${ext}`;
  const filePath = path.join(AVATAR_DIR, safeName);

  const buffer = Buffer.from(fileData.split(',')[1] || fileData, 'base64');
  fs.writeFileSync(filePath, buffer);

  const relativePath = `/data/avatars/${safeName}`;

  db.prepare(`
    INSERT OR REPLACE INTO user_profiles (user_id, avatar_path, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(userId, relativePath);

  res.json({ success: true, path: relativePath });
});

// ===== ДОКУМЕНТЫ =====

// Загрузить документ
router.post('/documents', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;
  const { title, fileData, fileType, fileName } = req.body;

  if (!title || !fileData) {
    return res.status(400).json({ error: 'Укажите название и файл' });
  }

  const ext = path.extname(fileName) || '.pdf';
  const safeName = `doc_${userId}_${Date.now()}${ext}`;
  const filePath = path.join(DOCS_DIR, safeName);

  const buffer = Buffer.from(fileData.split(',')[1] || fileData, 'base64');
  fs.writeFileSync(filePath, buffer);

  const relativePath = `/data/user-documents/${safeName}`;

  const result = db.prepare(`
    INSERT INTO user_documents (user_id, title, file_path, file_type)
    VALUES (?, ?, ?, ?)
  `).run(userId, title, relativePath, fileType || 'application/pdf');

  res.json({ id: result.lastInsertRowid, success: true });
});

// Получить свои документы
router.get('/documents', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;

  const docs = db.prepare(`
    SELECT * FROM user_documents WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId);

  res.json(docs);
});

// Удалить документ
router.delete('/documents/:id', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;
  const docId = req.params.id;

  const doc = db.prepare('SELECT * FROM user_documents WHERE id = ? AND user_id = ?').get(docId, userId);
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });

  if (doc.file_path) {
    const fullPath = path.join(__dirname, '..', doc.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }

  db.prepare('DELETE FROM user_documents WHERE id = ?').run(docId);
  res.json({ success: true });
});

// ===== ЧАТ =====

// Отправить сообщение
router.post('/chat', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;
  const { message } = req.body;

  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'Введите сообщение' });
  }

  const user = db.prepare('SELECT login FROM users WHERE id = ?').get(userId);

  const result = db.prepare(`
    INSERT INTO chat_messages (user_id, user_name, message)
    VALUES (?, ?, ?)
  `).run(userId, user.login, message.trim());

  res.json({ id: result.lastInsertRowid, success: true });
});

// Получить сообщения чата
router.get('/chat', requireAuth, (req, res) => {
  const db = getDB();
  const { limit = 100 } = req.query;

  const messages = db.prepare(`
    SELECT cm.*, up.avatar_path
    FROM chat_messages cm
    LEFT JOIN user_profiles up ON cm.user_id = up.user_id
    ORDER BY cm.created_at DESC
    LIMIT ?
  `).all(parseInt(limit));

  res.json(messages.reverse());
});

// ===== ЗАПРОСЫ (ОТПУСК, АВАНС) =====

// Создать запрос
router.post('/requests', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;
  const { requestType, description } = req.body;

  if (!requestType || !['vacation', 'advance'].includes(requestType)) {
    return res.status(400).json({ error: 'Тип запроса: vacation или advance' });
  }

  const user = db.prepare('SELECT login FROM users WHERE id = ?').get(userId);

  const result = db.prepare(`
    INSERT INTO user_requests (user_id, user_name, request_type, description)
    VALUES (?, ?, ?, ?)
  `).run(userId, user.login, requestType, description || '');

  res.json({ id: result.lastInsertRowid, success: true });
});

// Получить свои запросы
router.get('/requests', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;

  const requests = db.prepare(`
    SELECT * FROM user_requests WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId);

  res.json(requests);
});

// Админ: получить все запросы
router.get('/requests/all', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();

  const requests = db.prepare(`
    SELECT ur.*, u.login
    FROM user_requests ur
    JOIN users u ON ur.user_id = u.id
    ORDER BY ur.created_at DESC
  `).all();

  res.json(requests);
});

// Админ: ответить на запрос
router.post('/requests/:id/resolve', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();
  const requestId = req.params.id;
  const adminId = req.session.userId;
  const { status } = req.body;

  if (!status || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Статус: approved или rejected' });
  }

  db.prepare(`
    UPDATE user_requests 
    SET status = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
    WHERE id = ?
  `).run(status, adminId, requestId);

  res.json({ success: true });
});

// ===== ГРАФИК СМЕН =====

// Получить свой график смен
router.get('/shifts', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;
  const { startDate, endDate } = req.query;

  const shifts = db.prepare(`
    SELECT * FROM shift_start 
    WHERE user_id = ? AND date BETWEEN ? AND ?
    ORDER BY date DESC
  `).all(userId, startDate || '2024-01-01', endDate || '2099-12-31');

  res.json(shifts);
});

// ===== ИНСТРУКЦИИ =====

// Получить инструкции
router.get('/instructions', requireAuth, (req, res) => {
  const db = getDB();

  const instructions = db.prepare(`
    SELECT * FROM instructions ORDER BY category, title
  `).all();

  res.json(instructions);
});

// Админ: добавить инструкцию
router.post('/instructions', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();
  const { title, content, category } = req.body;

  if (!title) return res.status(400).json({ error: 'Укажите заголовок' });

  const result = db.prepare(`
    INSERT INTO instructions (title, content, category)
    VALUES (?, ?, ?)
  `).run(title, content || '', category || 'general');

  res.json({ id: result.lastInsertRowid, success: true });
});

// Админ: удалить инструкцию
router.delete('/instructions/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM instructions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
