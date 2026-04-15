import { getFreshUserBySession, getSessionByToken } from '../services/authService.js';
import { json } from '../utils/http.js';

function tokenFromRequest(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

export async function requireAuth(req, res, next) {
  try {
    const token = tokenFromRequest(req);
    const session = getSessionByToken(token);
    if (!session) return json(res, false, { error: 'Требуется вход' }, 401);
    const user = await getFreshUserBySession(session);
    if (!user) return json(res, false, { error: 'Сессия недействительна' }, 401);
    req.authToken = token;
    req.session = session;
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return json(res, false, { error: 'Требуются права администратора' }, 403);
  }
  return next();
}
