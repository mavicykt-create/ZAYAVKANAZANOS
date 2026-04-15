import bcrypt from 'bcryptjs';
import { getDb } from '../db/connection.js';
import { makeToken } from '../db/schema.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

export async function login({ login, password }) {
  const db = await getDb();
  const user = await db.get('SELECT * FROM users WHERE login = ?', [login]);
  if (!user || !user.is_active) throw new HttpError(401, 'Неверный логин или пароль');
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new HttpError(401, 'Неверный логин или пароль');

  const token = makeToken();
  await db.run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
  await db.run(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES (?, ?, datetime('now', '+14 days'))`,
    [token, user.id]
  );
  await db.run('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
  return {
    token,
    user: { id: user.id, login: user.login, role: user.role }
  };
}

export async function logout(token) {
  const db = await getDb();
  if (token) await db.run('DELETE FROM sessions WHERE token = ?', [token]);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: env.sessionTtlMs
  };
}
