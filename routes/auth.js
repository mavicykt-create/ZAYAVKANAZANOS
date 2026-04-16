const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../services/database');
const { requireAuth, getCurrentUser } = require('../middleware/auth');
const router = express.Router();

// Login
router.post('/login', (req, res) => {
  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({ error: 'Login and password required' });
  }

  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE login = ? AND is_active = 1').get(login);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Update last login
  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

  // Log action
  db.prepare('INSERT INTO user_actions_log (user_id, action_type, details) VALUES (?, ?, ?)')
    .run(user.id, 'login', JSON.stringify({ ip: req.ip }));

  req.session.userId = user.id;

  res.json({
    id: user.id,
    login: user.login,
    role: user.role
  });
});

// Logout
router.post('/logout', requireAuth, (req, res) => {
  const userId = req.session.userId;
  req.session.destroy();

  const db = getDB();
  db.prepare('INSERT INTO user_actions_log (user_id, action_type) VALUES (?, ?)')
    .run(userId, 'logout');

  res.json({ success: true });
});

// Check session
router.get('/me', (req, res) => {
  const user = getCurrentUser(req);
  if (user) {
    res.json(user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

module.exports = router;
