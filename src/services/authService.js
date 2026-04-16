import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db.js';
import { SESSION_TTL_MS } from '../config.js';
import { nowIso } from '../utils/time.js';
import { logAction } from './statsService.js';

export function loginUser(login, password) {
  const user = db.prepare(`SELECT * FROM users WHERE login = ? AND is_active = 1`).get(login);
  if (!user) return null;
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return null;

  const token = crypto.randomBytes(24).toString('hex');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);

  db.prepare(`
    INSERT INTO sessions (token, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(token, user.id, createdAt.toISOString(), expiresAt.toISOString());

  db.prepare(`UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`)
    .run(nowIso(), nowIso(), user.id);

  logAction(user.id, 'login', { login });
  return { token, user: sanitizeUser(user) };
}

export function sanitizeUser(user) {
  return {
    id: user.id,
    login: user.login,
    role: user.role,
    is_active: !!user.is_active,
    last_login_at: user.last_login_at
  };
}

export function getUserByToken(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND datetime(s.expires_at) > datetime('now') AND u.is_active = 1
  `).get(token);
  if (!row) return null;
  return sanitizeUser(row);
}

export function logoutToken(token) {
  if (!token) return;
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}
