import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getHomeState } from '../services/stateService.js';
import { asyncHandler, json } from '../utils/http.js';

const router = Router();

router.get(
  '/state',
  requireAuth,
  asyncHandler(async (req, res) => {
    const state = await getHomeState(req.user);
    return json(res, true, { state });
  }),
);

export default router;
