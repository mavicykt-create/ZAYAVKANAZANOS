const express = require('express');
const webpush = require('web-push');
const { getDB } = require('../services/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// VAPID keys - generate with: npx web-push generate-vapid-keys
// Using environment variables or defaults for development
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BJtmZCYCFffWVUDGur8zQNAPcd7TBC73J4WWXunqnbKlwpbKhqtHWiaK4EtiA61pQEHBw7UReL__zJy4xno-Jgw';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'epzza3VYos2_nIbgLnnnYbRi6siskuEl48uKntj9Y38';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@zan12.ru';

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Get VAPID public key (for frontend subscription)
router.get('/vapid-public-key', requireAuth, (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

// Subscribe to push notifications
router.post('/subscribe', requireAuth, (req, res) => {
  const { subscription } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  try {
    db.prepare(`
      INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
    `).run(
      userId,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth
    );

    res.json({ success: true });
  } catch (e) {
    console.error('Push subscribe error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Unsubscribe from push notifications
router.post('/unsubscribe', requireAuth, (req, res) => {
  const { endpoint } = req.body;
  const db = getDB();

  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  res.json({ success: true });
});

// Get all subscriptions (admin only)
router.get('/subscriptions', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();
  const subs = db.prepare(`
    SELECT ps.*, u.login as user_name
    FROM push_subscriptions ps
    LEFT JOIN users u ON ps.user_id = u.id
    ORDER BY ps.created_at DESC
  `).all();
  res.json(subs);
});

// Send push notification to all subscribers (admin only)
router.post('/send-all', requireAuth, requireAdmin, async (req, res) => {
  const { title, body } = req.body;
  const db = getDB();

  if (!title || !body) {
    return res.status(400).json({ error: 'Укажите заголовок и текст' });
  }

  const subs = db.prepare('SELECT * FROM push_subscriptions').all();
  const results = { sent: 0, failed: 0 };

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        },
        JSON.stringify({ title, body })
      );
      results.sent++;
    } catch (e) {
      console.error('Push send error:', e.message);
      results.failed++;
      // Remove invalid subscriptions
      if (e.statusCode === 410 || e.statusCode === 404) {
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
      }
    }
  }

  res.json({ success: true, ...results });
});

// Send push notification to specific user (admin only)
router.post('/send-user', requireAuth, requireAdmin, async (req, res) => {
  const { userId, title, body } = req.body;
  const db = getDB();

  if (!userId || !title || !body) {
    return res.status(400).json({ error: 'Укажите пользователя, заголовок и текст' });
  }

  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  const results = { sent: 0, failed: 0 };

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        },
        JSON.stringify({ title, body })
      );
      results.sent++;
    } catch (e) {
      console.error('Push send error:', e.message);
      results.failed++;
      if (e.statusCode === 410 || e.statusCode === 404) {
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
      }
    }
  }

  res.json({ success: true, ...results });
});

module.exports = router;
