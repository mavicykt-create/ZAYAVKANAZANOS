import webPush from 'web-push';
import { env } from '../config/env.js';
import { getDb } from '../db/connection.js';

if (env.webPushPublicKey && env.webPushPrivateKey) {
  webPush.setVapidDetails(env.webPushSubject, env.webPushPublicKey, env.webPushPrivateKey);
}

export async function saveSubscription(userId, subscription) {
  const db = await getDb();
  await db.run(
    `INSERT INTO push_subscriptions (user_id, endpoint, subscription_json)
     VALUES (?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       subscription_json = excluded.subscription_json`,
    [userId, subscription.endpoint, JSON.stringify(subscription)]
  );
}

export async function sendPush({ userId = null, title, text }) {
  const db = await getDb();
  const rows = userId
    ? await db.all('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId])
    : await db.all('SELECT * FROM push_subscriptions');

  if (!env.webPushPublicKey || !env.webPushPrivateKey) {
    return { delivered: 0, skipped: rows.length, configured: false };
  }

  let delivered = 0;
  for (const row of rows) {
    try {
      await webPush.sendNotification(JSON.parse(row.subscription_json), JSON.stringify({ title, text }));
      delivered += 1;
    } catch {
      // ignore bad subscription
    }
  }
  return { delivered, skipped: rows.length - delivered, configured: true };
}
