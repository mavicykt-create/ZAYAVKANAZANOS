import fs from 'fs';
import path from 'path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { initDb } from './db/schema.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { startSyncScheduler } from './services/syncService.js';

await initDb();
fs.mkdirSync(env.imageCacheDir, { recursive: true });

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/image-cache-v5', express.static(env.imageCacheDir, { maxAge: '30d', immutable: true }));
app.use(express.static(path.join(process.cwd(), 'public'), { maxAge: '1h' }));
app.use('/api', apiRouter);
app.get('/health', (_req, res) => res.json({ ok: true, name: env.appName }));
app.get('*', (_req, res) => res.sendFile(path.join(process.cwd(), 'public', 'index.html')));
app.use(errorHandler);

app.listen(env.port, env.host, () => {
  console.log(`ZAN 1.1 started on http://${env.host}:${env.port}`);
});

startSyncScheduler();
