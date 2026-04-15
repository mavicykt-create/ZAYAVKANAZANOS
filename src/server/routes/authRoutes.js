import { Router } from 'express';
import { createSessionForUser, removeSession } from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, json } from '../utils/http.js';

const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const login = String(req.body?.login || '').trim();
    const password = String(req.body?.password || '').trim();
    if (!login || !password) return json(res, false, { error: 'Логин и пароль обязательны' }, 400);
    const session = await createSessionForUser(login, password);
    return json(res, true, {
      token: session.token,
      role: session.user.role,
      user: session.user,
    });
  }),
);

router.post('/logout', requireAuth, (req, res) => {
  removeSession(req.authToken);
  return json(res, true, { message: 'Вы вышли из системы' });
});

router.get('/me', requireAuth, (req, res) => {
  return json(res, true, {
    user: {
      id: Number(req.user.id),
      login: req.user.login,
      role: req.user.role,
    },
  });
});

export default router;
