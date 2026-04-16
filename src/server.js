import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import { PORT, IMAGE_CACHE_DIR } from './config.js';
import { ensureDir } from './utils/fs.js';
import authRoutes from './routes/authRoutes.js';
import catalogRoutes from './routes/catalogRoutes.js';
import carryRoutes from './routes/carryRoutes.js';
import priceCheckRoutes from './routes/priceCheckRoutes.js';
import productCheckRoutes from './routes/productCheckRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

ensureDir('/data');
ensureDir(IMAGE_CACHE_DIR);
initDb();

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/image-cache', express.static(IMAGE_CACHE_DIR, {
  maxAge: '7d',
  immutable: true
}));
app.use(express.static(publicDir, { extensions: ['html'] }));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'zan-1.1' });
});

app.use('/api/auth', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/carry', carryRoutes);
app.use('/api/price-check', priceCheckRoutes);
app.use('/api/product-check', productCheckRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/admin', adminRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ZAN 1.1 started on port ${PORT}`);
});
