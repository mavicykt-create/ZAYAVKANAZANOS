import path from 'path';

export const config = {
  port: Number(process.env.PORT || 3000),
  dbDir: process.env.DB_DIR || path.join(process.cwd(), 'data'),
  ymlUrl: process.env.YML_URL || 'https://milku.ru/site1/export-yandex-YML/',
  lockTtlMs: Number(process.env.LOCK_TTL_MS || 2 * 60 * 1000),
  imageCacheVersion: process.env.IMAGE_CACHE_VERSION || 'v5',
  imageWidth: Number(process.env.IMAGE_WIDTH || 100),
  imageQuality: Number(process.env.IMAGE_QUALITY || 22),
  syncCooldownMs: Number(process.env.SYNC_COOLDOWN_MS || 60 * 60 * 1000),
  defaultAdminLogin: process.env.DEFAULT_ADMIN_LOGIN || 'admin',
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD || '7895123',
  defaultUserLogin: process.env.DEFAULT_USER_LOGIN || 'user',
  defaultUserPassword: process.env.DEFAULT_USER_PASSWORD || '7895123',
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@zan.local',
};
