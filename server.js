const express = require('express');
const path = require('path');
const session = require('express-session');
const { initDB, getDB } = require('./services/database');

const app = express();
const PORT = process.env.PORT || 8080;

// Initialize database
initDB();

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads
app.use('/data/image-cache-v5', express.static(path.join(__dirname, 'data/image-cache-v5')));
app.use('/data/claims-uploads', express.static(path.join(__dirname, 'data/claims-uploads')));
app.use('/data/special-tasks-uploads', express.static(path.join(__dirname, 'data/special-tasks-uploads')));
app.use('/data/avatars', express.static(path.join(__dirname, 'data/avatars')));
app.use('/data/user-documents', express.static(path.join(__dirname, 'data/user-documents')));

// Static public files
app.use(express.static(path.join(__dirname, 'public')));

// Session
const sessionSecret = process.env.SESSION_SECRET || 'zan12-default-secret-change-me';
if (!process.env.SESSION_SECRET) {
  console.warn('WARN: SESSION_SECRET not set, using default. Set it for production!');
}
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Health check for Amvera
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', version: '1.2.0' });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/catalog', require('./routes/catalog'));
app.use('/api/carry', require('./routes/carry'));
app.use('/api/price-check', require('./routes/priceCheck'));
app.use('/api/product-check', require('./routes/productCheck'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/shift', require('./routes/shift'));
app.use('/api/claims', require('./routes/claims'));
app.use('/api/special-tasks', require('./routes/specialTasks'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/expiry-check', require('./routes/expiryCheck'));
app.use('/api/push', require('./routes/push'));
app.use('/api/scores', require('./routes/scores'));

// Serve SPA
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`ZAN 1.2 running on port ${PORT}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down...`);
  server.close(() => {
    const db = getDB();
    if (db) db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
