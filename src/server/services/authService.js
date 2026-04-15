import crypto from 'crypto';
import { get, run } from '../../db.js';
import { nowTs } from '../utils/format.js';
import { HttpError } from '../utils/http.js';
import { logUserAction } from './actionLogService.js';

const sessions = new Map();

export function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password ?? '')).digest('hex');
}

export function makeSessionToken() {
  return crypto.randomBytes(18).toString('hex');
}

export function getSessionByToken(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  session.lastSeenAt = nowTs();
  return session;
}

export function removeSession(token) {
  if (!token) return;
  sessions.delete(token);
}

export async function createSessionForUser(login, password) {
  const user = await get(
    `SELECT id, login, password_hash, role, is_active FROM users WHERE login = ?`,
    [String(login || '').trim()],
  );
  if (!user || user.password_hash !== hashPassword(password)) {
    throw new HttpError(401, 'Неверный логин или пароль');
  }
  if (Number(user.is_active) !== 1) {
    throw new HttpError(403, 'Пользователь отключен');
  }

  const token = makeSessionToken();
  const session = {
    token,
    id: Number(user.id),
    login: user.login,
    role: user.role,
    isActive: Number(user.is_active),
    createdAt: nowTs(),
    lastSeenAt: nowTs(),
  };
  sessions.set(token, session);

  await run(`UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`, [
    nowTs(),
    nowTs(),
    session.id,
  ]);
  await logUserAction(session.id, 'login', { module: 'auth' });

  return {
    token,
    user: {
      id: session.id,
      login: session.login,
      role: session.role,
    },
  };
}

export async function getFreshUserBySession(session) {
  if (!session) return null;
  const dbUser = await get(`SELECT id, login, role, is_active FROM users WHERE id = ?`, [session.id]);
  if (!dbUser || Number(dbUser.is_active) !== 1) return null;
  session.login = dbUser.login;
  session.role = dbUser.role;
  session.isActive = Number(dbUser.is_active);
  return {
    id: Number(dbUser.id),
    login: dbUser.login,
    role: dbUser.role,
    isActive: Number(dbUser.is_active),
  };
}
