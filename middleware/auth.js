const { getDB } = require('../services/database');

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDB();
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);

  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function getCurrentUser(req) {
  if (!req.session.userId) return null;
  const db = getDB();
  return db.prepare('SELECT id, login, role FROM users WHERE id = ?').get(req.session.userId);
}

module.exports = { requireAuth, requireAdmin, getCurrentUser };
