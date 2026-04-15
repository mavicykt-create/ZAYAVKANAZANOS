import { json } from '../utils/http.js';

export function notFoundHandler(req, res) {
  return json(res, false, { error: 'Маршрут не найден' }, 404);
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = Number(error?.status) || 500;
  const message = error?.message || 'Внутренняя ошибка сервера';
  if (status >= 500) console.error('Unhandled error:', error);
  return json(res, false, { error: message }, status);
}
