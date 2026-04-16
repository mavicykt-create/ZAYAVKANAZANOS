import { SESSION_COOKIE } from '../config.js';
import { getUserByToken } from '../services/authService.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ ok: false, message: 'auth required' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, message: 'admin only' });
  }
  next();
}
