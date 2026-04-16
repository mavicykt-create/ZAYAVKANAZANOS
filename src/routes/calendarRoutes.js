import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { weekDates } from '../utils/time.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const dates = weekDates();
  const rows = db.prepare(`
    SELECT * FROM weekly_calendar_items
    WHERE date IN (${dates.map(() => '?').join(',')})
    ORDER BY date ASC, id ASC
  `).all(...dates);
  res.json({ ok: true, dates, items: rows });
});

router.post('/', requireAdmin, (req, res) => {
  const { date, title, text } = req.body || {};
  const info = db.prepare(`
    INSERT INTO weekly_calendar_items (date, title, text)
    VALUES (?, ?, ?)
  `).run(date, title, text);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/:id', requireAdmin, (req, res) => {
  const { date, title, text } = req.body || {};
  db.prepare(`UPDATE weekly_calendar_items SET date = ?, title = ?, text = ? WHERE id = ?`)
    .run(date, title, text, Number(req.params.id));
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare(`DELETE FROM weekly_calendar_items WHERE id = ?`).run(Number(req.params.id));
  res.json({ ok: true });
});

export default router;
