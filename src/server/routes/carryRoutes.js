import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  completeCarryOrder,
  confirmCarryCategory,
  decrementCarryItem,
  getCarryCategoryProducts,
  getCarryPicking,
  incrementCarryItem,
  listCarryCategories,
  toggleCarryPicked,
} from '../services/carryService.js';
import { asyncHandler, json } from '../utils/http.js';
import { logUserAction } from '../services/actionLogService.js';

const router = Router();

router.get(
  '/carry/categories',
  requireAuth,
  asyncHandler(async (req, res) => {
    const categories = await listCarryCategories();
    return json(res, true, { categories });
  }),
);

router.get(
  '/carry/category/:id/products',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = await getCarryCategoryProducts(req.params.id);
    return json(res, true, payload);
  }),
);

router.post(
  '/carry/items/:id/increment',
  requireAuth,
  asyncHandler(async (req, res) => {
    await incrementCarryItem(req.user.id, req.params.id);
    return json(res, true, { message: 'Количество увеличено' });
  }),
);

router.post(
  '/carry/items/:id/decrement',
  requireAuth,
  asyncHandler(async (req, res) => {
    const qty = await decrementCarryItem(req.user.id, req.params.id);
    return json(res, true, { qty });
  }),
);

router.post(
  '/carry/categories/:id/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    await confirmCarryCategory(req.user.id, req.params.id);
    return json(res, true, { message: 'Категория подтверждена' });
  }),
);

router.get(
  '/carry/picking',
  requireAuth,
  asyncHandler(async (req, res) => {
    const picking = await getCarryPicking();
    return json(res, true, picking);
  }),
);

router.post(
  '/carry/items/:id/toggle-picked',
  requireAuth,
  asyncHandler(async (req, res) => {
    const picked = await toggleCarryPicked(req.params.id);
    return json(res, true, { picked });
  }),
);

router.post(
  '/carry/complete-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await completeCarryOrder(req.user.id);
    return json(res, true, { message: 'Заявка собрана полностью' });
  }),
);

router.post(
  '/carry/reset',
  requireAuth,
  asyncHandler(async (req, res) => {
    await completeCarryOrder(req.user.id);
    return json(res, true, { message: 'Заявка очищена' });
  }),
);

router.get(
  '/carry/print',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = await getCarryPicking();
    await logUserAction(req.user.id, 'print', { module: 'carry' });
    return json(res, true, payload);
  }),
);

export default router;
