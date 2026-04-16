/**
 * ZAN 1.1 - Main Server
 * Warehouse Management System
 */

const express = require('express');
const session = require('express-session');
const path = require('path');
const { initializeDB } = require('./services/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
initializeDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'zan11-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/catalog', require('./routes/catalog'));
app.use('/api/carry', require('./routes/carry'));
app.use('/api/price-check', require('./routes/priceCheck'));
app.use('/api/product-check', require('./routes/productCheck'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/stats', require('./routes/stats'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║                                                ║
║   ZAN 1.1 - Warehouse Management System        ║
║                                                ║
║   Server running on http://localhost:${PORT}      ║
║                                                ║
╚════════════════════════════════════════════════╝
  `);
});

module.exports = app;
