import { Router } from 'express';
import { env } from '../config/env.js';
import { authRequired } from '../middleware/auth.js';
import { login, logout, sessionCookieOptions } from '../services/authService.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const result = await login(req.body || {});
    res.cookie(env.sessionCookie, result.token, sessionCookieOptions());
    res.json({ ok: true, user: result.user });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', authRequired, async (req, res, next) => {
  try {
    await logout(req.cookies?.[env.sessionCookie]);
    res.clearCookie(env.sessionCookie);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authRequired, async (req, res) => {
  res.json({ ok: true, user: req.user });
});

export default router;
