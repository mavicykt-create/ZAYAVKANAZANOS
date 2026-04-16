import { getDb } from '../db/connection.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

export async function authRequired(req, _res, next) {
  try {
    const token = req.cookies?.[env.sessionCookie];
    if (!token) throw new HttpError(401, 'Нужна авторизация');

    const db = await getDb();
    const session = await db.get(
      `SELECT s.user_id, u.login, u.role, u.is_active
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`,
      [token]
    );

    if (!session || !session.is_active) throw new HttpError(401, 'Сессия недействительна');
    req.user = { id: session.user_id, login: session.login, role: session.role };
    next();
  } catch (error) {
    next(error);
  }
}

export function adminRequired(req, _res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(new HttpError(403, 'Только для администратора'));
  }
  next();
}
