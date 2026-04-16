const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

let syncProcess = null;

// Get sync status
router.get('/status', requireAuth, (req, res) => {
  const { getDB } = require('../services/database');
  const db = getDB();
  const status = db.prepare('SELECT * FROM sync_status WHERE id = 1').get();
  res.json(status);
});

// Start sync (admin only)
router.post('/start', requireAuth, requireAdmin, async (req, res) => {
  if (syncProcess) {
    return res.status(400).json({ error: 'Sync already in progress' });
  }

  // Run sync in background
  const { syncCatalog } = require('../services/sync');

  syncProcess = syncCatalog()
    .then(() => {
      syncProcess = null;
    })
    .catch(err => {
      console.error('Sync error:', err);
      syncProcess = null;
    });

  res.json({ success: true, message: 'Sync started' });
});

// Reset sync (admin only)
router.post('/reset', requireAuth, requireAdmin, (req, res) => {
  const { getDB } = require('../services/database');
  const db = getDB();

  db.prepare(`
    UPDATE sync_status 
    SET status = 'idle', progress = 0, stage = NULL, message = NULL
    WHERE id = 1
  `).run();

  syncProcess = null;

  res.json({ success: true });
});

// Clear image cache (admin only)
router.post('/clear-cache', requireAuth, requireAdmin, (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const cacheDir = path.join(__dirname, '../data/image-cache-v5');

  fs.readdir(cacheDir, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });

    for (const file of files) {
      if (file !== '.gitkeep') {
        fs.unlinkSync(path.join(cacheDir, file));
      }
    }

    res.json({ success: true });
  });
});

module.exports = router;
