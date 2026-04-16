import path from 'path';

const rootDir = process.cwd();
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data');

export const env = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  appName: 'ZAN 1.1',
  sessionCookie: 'zan_session',
  sessionTtlMs: 1000 * 60 * 60 * 24 * 14,
  catalogUrl: process.env.CATALOG_URL || 'https://milku.ru/site1/export-yandex-YML/',
  dataDir,
  dbPath: process.env.DB_PATH || path.join(dataDir, 'zan.sqlite'),
  imageCacheDir: process.env.IMAGE_CACHE_DIR || path.join(dataDir, 'image-cache-v5'),
  syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS || 1000 * 60 * 60),
  webPushPublicKey: process.env.WEB_PUSH_PUBLIC_KEY || '',
  webPushPrivateKey: process.env.WEB_PUSH_PRIVATE_KEY || '',
  webPushSubject: process.env.WEB_PUSH_SUBJECT || 'mailto:admin@example.com'
};
