import webPush from 'web-push';
import { all, get, run } from '../../db.js';
import { config } from '../config.js';
import { nowTs } from '../utils/format.js';

if (config.vapidPublicKey && config.vapidPrivateKey) {
  webPush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
}

export function getPushConfig() {
  return {
    configured: Boolean(config.vapidPublicKey && config.vapidPrivateKey),
    publicKey: config.vapidPublicKey || '',
  };
}

export async function savePushSubscription(userId, subscription) {
  const endpoint = String(subscription?.endpoint || '').trim();
  const keysAuth = String(subscription?.keys?.auth || '').trim();
  const keysP256dh = String(subscription?.keys?.p256dh || '').trim();
  if (!endpoint || !keysAuth || !keysP256dh) return;
  const ts = nowTs();
  await run(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys_auth, keys_p256dh, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       keys_auth = excluded.keys_auth,
       keys_p256dh = excluded.keys_p256dh,
       updated_at = excluded.updated_at`,
    [Number(userId), endpoint, keysAuth, keysP256dh, ts, ts],
  );
}

export async function removePushSubscription(endpoint) {
  await run(`DELETE FROM push_subscriptions WHERE endpoint = ?`, [String(endpoint || '').trim()]);
}

function mapToSubscription(row) {
  return {
    endpoint: row.endpoint,
    keys: {
      auth: row.keys_auth,
      p256dh: row.keys_p256dh,
    },
  };
}

export async function sendPushToUser(userId, payload) {
  const rows = await all(`SELECT * FROM push_subscriptions WHERE user_id = ?`, [Number(userId)]);
  return sendPushRows(rows, payload);
}

export async function sendPushToAll(payload) {
  const rows = await all(`SELECT * FROM push_subscriptions`);
  return sendPushRows(rows, payload);
}

async function sendPushRows(rows, payload) {
  const body = JSON.stringify({
    title: String(payload?.title || 'ZAN 1.1'),
    text: String(payload?.text || ''),
    url: String(payload?.url || '/'),
  });
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    return {
      sent: 0,
      skipped: rows.length,
      message: 'VAPID ключи не заданы. Сервис подготовлен, но отправка выключена.',
    };
  }

  let sent = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      await webPush.sendNotification(mapToSubscription(row), body);
      sent += 1;
    } catch {
      skipped += 1;
    }
  }
  return { sent, skipped, message: `Отправлено: ${sent}, пропущено: ${skipped}` };
}

export async function pushSubscribersCount() {
  const row = await get(`SELECT COUNT(*) AS cnt FROM push_subscriptions`);
  return Number(row?.cnt || 0);
}
