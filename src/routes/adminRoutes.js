import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { adminRequired, authRequired } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { getDb } from '../db/connection.js';
import { getCatalogStats } from '../services/catalogService.js';
import { sendPush, saveSubscription } from '../services/pushService.js';
import { getMonthlyRating } from '../services/statsService.js';
import { requestResetSync, runCatalogSync } from '../services/syncService.js';
import { problemItems } from '../services/priceCheckService.js';

const router = Router();
router.use(authRequired);

router.post('/push/subscribe', async (req, res, next) => {
  try { await saveSubscription(req.user.id, req.body); res.json({ ok: true }); } catch (error) { next(error); }
});

router.use(adminRequired);

router.get('/overview', async (_req, res, next) => {
  try {
    const db = await getDb();
    const stats = await getCatalogStats();
    const online = await db.get(`SELECT COUNT(DISTINCT user_id) AS count FROM sessions WHERE expires_at > datetime('now')`);
    res.json({ ok: true, online: online.count, ...stats });
  } catch (error) { next(error); }
});

router.get('/users', async (_req, res, next) => {
  try {
    const db = await getDb();
    const items = await db.all('SELECT id, login, role, is_active, last_login_at, created_at, updated_at FROM users ORDER BY id');
    res.json({ ok: true, items });
  } catch (error) { next(error); }
});

router.post('/users', async (req, res, next) => {
  try {
    const db = await getDb();
    const passwordHash = await bcrypt.hash(req.body.password || '7895123', 10);
    const result = await db.run(
      'INSERT INTO users (login, password_hash, role, is_active) VALUES (?, ?, ?, ?)',
      [req.body.login, passwordHash, req.body.role || 'staff', req.body.isActive ? 1 : 0]
    );
    res.json({ ok: true, id: result.lastID });
  } catch (error) { next(error); }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    const fields = [req.body.login, req.body.role, req.body.isActive ? 1 : 0, Number(req.params.id)];
    await db.run('UPDATE users SET login = ?, role = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', fields);
    if (req.body.password) {
      const passwordHash = await bcrypt.hash(req.body.password, 10);
      await db.run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [passwordHash, Number(req.params.id)]);
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    await db.run('DELETE FROM users WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.post('/catalog/sync', async (_req, res, next) => {
  try { res.json(await runCatalogSync()); } catch (error) { next(error); }
});
router.post('/catalog/reset', async (_req, res, next) => {
  try { await requestResetSync(); res.json({ ok: true }); } catch (error) { next(error); }
});
router.post('/catalog/clear-cache', async (_req, res, next) => {
  try {
    fs.rmSync(env.imageCacheDir, { recursive: true, force: true });
    fs.mkdirSync(env.imageCacheDir, { recursive: true });
    const db = await getDb();
    await db.run('UPDATE products SET picture_cached = NULL');
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.get('/locks', async (_req, res, next) => {
  try {
    const db = await getDb();
    const items = await db.all(`
      SELECT pcp.category_id, c.name AS category_name, pcp.page_number, pcp.locked_at, u.login AS locked_by
      FROM price_check_pages pcp
      LEFT JOIN users u ON u.id = pcp.locked_by
      JOIN categories c ON c.id = pcp.category_id
      WHERE pcp.locked_by IS NOT NULL
      ORDER BY c.sort_order, pcp.page_number
    `);
    res.json({ ok: true, items });
  } catch (error) { next(error); }
});

router.post('/push/send', async (req, res, next) => {
  try {
    const result = await sendPush({ userId: req.body.userId || null, title: req.body.title, text: req.body.text });
    res.json({ ok: true, result });
  } catch (error) { next(error); }
});

router.get('/stats/rating', async (_req, res, next) => {
  try { res.json({ ok: true, items: await getMonthlyRating() }); } catch (error) { next(error); }
});

router.get('/problem-items', async (_req, res, next) => {
  try { res.json({ ok: true, items: await problemItems() }); } catch (error) { next(error); }
});

export default router;
