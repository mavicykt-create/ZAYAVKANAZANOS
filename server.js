const express = require('express');
const path = require('path');
const session = require('express-session');
const { initDB } = require('./services/database');

const app = express();
const PORT = process.env.PORT || 80;

// Initialize database
initDB();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Раздача картинок из data/image-cache-v5
app.use('/data/image-cache-v5', express.static(path.join(__dirname, 'data/image-cache-v5')));

// Раздача вложений претензий
app.use('/data/claims-uploads', express.static(path.join(__dirname, 'data/claims-uploads')));

// Раздача статики
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'zan11-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

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

// Serve main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch all for SPA
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ZAN 1.1 running on port ${PORT}`);
});
