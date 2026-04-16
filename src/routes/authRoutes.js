import { Router } from 'express';
import { SESSION_COOKIE, SESSION_TTL_MS } from '../config.js';
import { loginUser, logoutToken } from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { login, password } = req.body || {};
  const result = loginUser(login, password);
  if (!result) return res.status(401).json({ ok: false, message: 'Неверный логин или пароль' });

  res.cookie(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS
  });

  res.json({ ok: true, user: result.user });
});

router.post('/logout', requireAuth, (req, res) => {
  logoutToken(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

export default router;
