import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { IMAGE_CACHE_DIR, PUSH_PRIVATE_KEY, PUSH_PUBLIC_KEY } from '../config.js';
import { getSyncStatus, resetSyncStatus, runCatalogSync } from '../services/syncService.js';
import { getMonthlyLeaderboard } from '../services/statsService.js';
import { nowIso } from '../utils/time.js';

const router = Router();
router.use(requireAuth, requireAdmin);

if (PUSH_PUBLIC_KEY && PUSH_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:admin@example.com', PUSH_PUBLIC_KEY, PUSH_PRIVATE_KEY);
}

router.get('/overview', (req, res) => {
  const online = db.prepare(`
    SELECT COUNT(*) AS count
    FROM sessions
    WHERE datetime(expires_at) > datetime('now')
  `).get();
  const products = db.prepare(`SELECT COUNT(*) AS count FROM catalog_items`).get();
  const noBarcode = db.prepare(`SELECT COUNT(*) AS count FROM catalog_items WHERE barcode IS NULL OR trim(barcode) = ''`).get();

  res.json({
    ok: true,
    overview: {
      online_staff: online.count,
      products: products.count,
      no_barcode: noBarcode.count,
      sync_status: getSyncStatus()
    }
  });
});

router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT id, login, role, is_active, last_login_at, created_at, updated_at
    FROM users
    ORDER BY id ASC
  `).all();
  res.json({ ok: true, users });
});

router.post('/users', (req, res) => {
  const { login, password, role = 'staff', is_active = 1 } = req.body || {};
  const now = nowIso();
  const hash = bcrypt.hashSync(password || '7895123', 10);
  const info = db.prepare(`
    INSERT INTO users (login, password_hash, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(login, hash, role, is_active ? 1 : 0, now, now);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/users/:id', (req, res) => {
  const { login, password, role, is_active } = req.body || {};
  const existing = db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(req.params.id));
  if (!existing) return res.status(404).json({ ok: false, message: 'user not found' });
  const hash = password ? bcrypt.hashSync(password, 10) : existing.password_hash;
  db.prepare(`
    UPDATE users
    SET login = ?, password_hash = ?, role = ?, is_active = ?, updated_at = ?
    WHERE id = ?
  `).run(login ?? existing.login, hash, role ?? existing.role, is_active ? 1 : 0, nowIso(), Number(req.params.id));
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  db.prepare(`DELETE FROM users WHERE id = ?`).run(Number(req.params.id));
  res.json({ ok: true });
});

router.post('/catalog/sync', async (req, res) => {
  res.json(await runCatalogSync());
});

router.post('/catalog/reset-sync', (req, res) => {
  res.json({ ok: true, status: resetSyncStatus() });
});

router.post('/catalog/clear-image-cache', (req, res) => {
  if (fs.existsSync(IMAGE_CACHE_DIR)) {
    for (const file of fs.readdirSync(IMAGE_CACHE_DIR)) {
      fs.unlinkSync(path.join(IMAGE_CACHE_DIR, file));
    }
  }
  res.json({ ok: true });
});

router.get('/locks', (req, res) => {
  const locks = db.prepare(`
    SELECT p.category_id, c.name AS category_name, p.page_number, p.locked_at, u.login AS locked_by_login
    FROM price_check_pages p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN users u ON u.id = p.locked_by
    WHERE p.locked_by IS NOT NULL
    ORDER BY p.category_id, p.page_number
  `).all();
  res.json({ ok: true, locks });
});

router.post('/push/subscribe', (req, res) => {
  const sub = req.body;
  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, keys_json, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET keys_json = excluded.keys_json
  `).run(req.user.id, sub.endpoint, JSON.stringify(sub.keys || {}), nowIso());
  res.json({ ok: true });
});

router.post('/push/send', async (req, res) => {
  const { userId, title, text } = req.body || {};
  const rows = userId
    ? db.prepare(`SELECT * FROM push_subscriptions WHERE user_id = ?`).all(userId)
    : db.prepare(`SELECT * FROM push_subscriptions`).all();

  if (!PUSH_PUBLIC_KEY || !PUSH_PRIVATE_KEY) {
    return res.json({ ok: true, simulated: true, count: rows.length });
  }

  const payload = JSON.stringify({ title, text });
  for (const row of rows) {
    const subscription = { endpoint: row.endpoint, keys: JSON.parse(row.keys_json) };
    try {
      await webpush.sendNotification(subscription, payload);
    } catch (error) {
      console.error('push error', error.message);
    }
  }
  res.json({ ok: true, count: rows.length });
});

router.get('/stats/leaderboard', (req, res) => {
  res.json({ ok: true, leaderboard: getMonthlyLeaderboard() });
});

router.get('/problem-products', (req, res) => {
  const rows = db.prepare(`
    SELECT i.id, i.name, i.vendor_code, c.name AS category_name,
           COALESCE(SUM(m.status_problem), 0) AS problem_marks
    FROM catalog_items i
    JOIN categories c ON c.id = i.category_id
    LEFT JOIN price_check_marks m ON m.item_id = i.id
    GROUP BY i.id, i.name, i.vendor_code, c.name
    HAVING problem_marks > 0
    ORDER BY problem_marks DESC, i.name ASC
  `).all();
  res.json({ ok: true, rows });
});

export default router;
