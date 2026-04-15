import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { getMonthlyRating, getUserStats } from '../services/statsService.js';
import { asyncHandler, json } from '../utils/http.js';

const router = Router();

router.get(
  '/stats/monthly-rating',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await getMonthlyRating(req.query.month);
    return json(res, true, data);
  }),
);

router.get(
  '/stats/user/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = await getUserStats(req.params.id, req.query.month);
    return json(res, true, data);
  }),
);

export default router;
