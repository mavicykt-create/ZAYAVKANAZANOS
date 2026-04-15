import { all, get, run } from '../../db.js';

export async function setAppState(key, value) {
  await run(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value ?? '')],
  );
}

export async function getAppState(key, fallback = '') {
  const row = await get(`SELECT value FROM app_state WHERE key = ?`, [key]);
  return row?.value ?? fallback;
}

export async function ensureDefaultAppState(defaultMap) {
  for (const [key, value] of Object.entries(defaultMap)) {
    await run(`INSERT OR IGNORE INTO app_state (key, value) VALUES (?, ?)`, [key, String(value)]);
  }
}

export async function getSyncState() {
  const rows = await all(
    `SELECT key, value FROM app_state
     WHERE key IN (
       'sync_running', 'sync_progress', 'sync_stage', 'sync_message',
       'sync_last_started_at', 'sync_last_finished_at',
       'sync_total_offers', 'sync_processed_offers'
     )`,
  );
  const map = Object.fromEntries(rows.map((item) => [item.key, item.value]));
  return {
    running: map.sync_running === '1',
    progress: Number(map.sync_progress || 0),
    stage: map.sync_stage || 'idle',
    message: map.sync_message || '',
    lastStartedAt: Number(map.sync_last_started_at || 0) || null,
    lastFinishedAt: Number(map.sync_last_finished_at || 0) || null,
    totalOffers: Number(map.sync_total_offers || 0) || 0,
    processedOffers: Number(map.sync_processed_offers || 0) || 0,
  };
}
