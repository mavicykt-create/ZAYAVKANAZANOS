import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from '../db.js';
import { config } from './config.js';
import { errorHandler } from './middleware/error.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import carryRoutes from './routes/carryRoutes.js';
import catalogRoutes from './routes/catalogRoutes.js';
import priceCheckRoutes from './routes/priceCheckRoutes.js';
import productCheckRoutes from './routes/productCheckRoutes.js';
import pushRoutes from './routes/pushRoutes.js';
import stateRoutes from './routes/stateRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import { seedCategories, seedDefaultState, seedUsers } from './services/bootstrapService.js';
import { getImageCacheDir } from './services/imageService.js';
import { json } from './utils/http.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const publicDir = path.join(rootDir, 'public');

export async function createApp() {
  await initDb();
  await seedCategories();
  await seedUsers();
  await seedDefaultState();

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/image-cache', express.static(getImageCacheDir(), { maxAge: '365d', immutable: true }));
  app.use(express.static(publicDir));

  app.get('/api/health', (req, res) => json(res, true, { status: 'ok' }));

  app.use('/api', authRoutes);
  app.use('/api', stateRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api', carryRoutes);
  app.use('/api', priceCheckRoutes);
  app.use('/api', productCheckRoutes);
  app.use('/api', calendarRoutes);
  app.use('/api', statsRoutes);
  app.use('/api', pushRoutes);
  app.use('/api', adminRoutes);

  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use(errorHandler);
  return app;
}

export async function startServer() {
  const app = await createApp();
  return new Promise((resolve) => {
    const server = app.listen(config.port, () => {
      console.log(`ZAN 1.1 server started on :${config.port}`);
      resolve(server);
    });
  });
}
