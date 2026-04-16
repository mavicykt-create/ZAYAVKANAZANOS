const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/status', requireAuth, (req, res) => {
  const { getDB } = require('../services/database');
  const db = getDB();
  const status = db.prepare('SELECT * FROM sync_status WHERE id = 1').get();
  res.json(status);
});

router.post('/start', requireAuth, requireAdmin, async (req, res) => {
  const { syncCatalog } = require('../services/sync');
  syncCatalog().catch(err => console.error('Sync error:', err));
  res.json({ success: true, message: 'Sync started' });
});

module.exports = router;