import { Router } from 'express';
import { adminRequired, authRequired } from '../middleware/auth.js';
import { deleteCalendarItem, getWeekCalendar, saveCalendarItem } from '../services/calendarService.js';

const router = Router();
router.use(authRequired);

router.get('/', async (_req, res, next) => {
  try { res.json({ ok: true, items: await getWeekCalendar() }); } catch (error) { next(error); }
});
router.post('/', adminRequired, async (req, res, next) => {
  try { res.json({ ok: true, item: await saveCalendarItem(req.body) }); } catch (error) { next(error); }
});
router.delete('/:id', adminRequired, async (req, res, next) => {
  try { await deleteCalendarItem(Number(req.params.id)); res.json({ ok: true }); } catch (error) { next(error); }
});

export default router;
