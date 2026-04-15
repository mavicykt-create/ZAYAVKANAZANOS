import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import {
  createCalendarItem,
  deleteCalendarItem,
  getWeeklyCalendar,
  updateCalendarItem,
} from '../services/calendarService.js';
import { asyncHandler, json } from '../utils/http.js';

const router = Router();

router.get(
  '/calendar/week',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await getWeeklyCalendar(req.query.date);
    return json(res, true, data);
  }),
);

router.post(
  '/calendar/items',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = await createCalendarItem(req.user.id, req.body || {});
    return json(res, true, { id, message: 'Запись календаря создана' });
  }),
);

router.patch(
  '/calendar/items/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await updateCalendarItem(req.params.id, req.body || {});
    return json(res, true, { message: 'Запись календаря обновлена' });
  }),
);

router.delete(
  '/calendar/items/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await deleteCalendarItem(req.params.id);
    return json(res, true, { message: 'Запись календаря удалена' });
  }),
);

export default router;
