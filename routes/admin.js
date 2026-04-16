const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../services/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/stats', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();
  const stats = {
    totalProducts: db.prepare('SELECT COUNT(*) as count FROM products').get().count,
    totalCategories: db.prepare('SELECT COUNT(*) as count FROM categories').get().count,
    totalUsers: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
    activeSessions: 0
  };
  res.json(stats);
});

router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();
  const users = db.prepare(`
    SELECT id, login, role, is_active, last_login_at, created_at
    FROM users
    ORDER BY created_at DESC
  `).all();
  res.json(users);
});

router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const { login, password, role, isActive } = req.body;
  const db = getDB();
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare(`
      INSERT INTO users (login, password_hash, role, is_active)
      VALUES (?, ?, ?, ?)
    `).run(login, hash, role, isActive ? 1 : 0);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (e) {
    res.status(400).json({ error: 'Login already exists' });
  }
});

router.put('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { role, isActive, password } = req.body;
  const db = getDB();

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  }

  db.prepare(`
    UPDATE users SET role = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(role, isActive ? 1 : 0, id);

  res.json({ success: true });
});

router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.session.userId) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  const db = getDB();
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;