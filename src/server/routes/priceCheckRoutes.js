import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logUserAction } from '../services/actionLogService.js';
import {
  completePriceCheckPage,
  getPriceCheckCategoriesWithPages,
  getPriceCheckPageProducts,
  getPriceCheckReportRows,
  heartbeatPriceCheckPage,
  listPriceCheckPages,
  lockPriceCheckPage,
  togglePriceProblem,
  togglePriceTag,
  unlockPriceCheckPage,
} from '../services/priceCheckService.js';
import { asyncHandler, json } from '../utils/http.js';

const router = Router();

router.get(
  '/price-check/categories',
  requireAuth,
  asyncHandler(async (req, res) => {
    const categories = await getPriceCheckCategoriesWithPages();
    return json(res, true, { categories });
  }),
);

router.get(
  '/price-check/categories/:categoryId/pages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const pages = await listPriceCheckPages(req.params.categoryId, req.user.id);
    return json(res, true, { pages });
  }),
);

router.post(
  '/price-check/pages/:categoryId/:pageNumber/lock',
  requireAuth,
  asyncHandler(async (req, res) => {
    await lockPriceCheckPage(req.params.categoryId, req.params.pageNumber, req.user.id);
    return json(res, true, { message: 'Страница занята' });
  }),
);

router.post(
  '/price-check/pages/:categoryId/:pageNumber/unlock',
  requireAuth,
  asyncHandler(async (req, res) => {
    await unlockPriceCheckPage(req.params.categoryId, req.params.pageNumber, req.user.id);
    return json(res, true, { message: 'Страница освобождена' });
  }),
);

router.post(
  '/price-check/pages/:categoryId/:pageNumber/heartbeat',
  requireAuth,
  asyncHandler(async (req, res) => {
    await heartbeatPriceCheckPage(req.params.categoryId, req.params.pageNumber, req.user.id);
    return json(res, true, { message: 'Heartbeat ok' });
  }),
);

router.get(
  '/price-check/pages/:categoryId/:pageNumber/products',
  requireAuth,
  asyncHandler(async (req, res) => {
    const products = await getPriceCheckPageProducts(req.params.categoryId, req.params.pageNumber, req.user.id);
    return json(res, true, { products });
  }),
);

router.post(
  '/price-check/items/:id/toggle-problem',
  requireAuth,
  asyncHandler(async (req, res) => {
    const state = await togglePriceProblem(req.user.id, req.params.id);
    return json(res, true, state);
  }),
);

router.post(
  '/price-check/items/:id/toggle-price',
  requireAuth,
  asyncHandler(async (req, res) => {
    const state = await togglePriceTag(req.user.id, req.params.id);
    return json(res, true, state);
  }),
);

router.post(
  '/price-check/pages/:categoryId/:pageNumber/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    await completePriceCheckPage(req.user.id, req.params.categoryId, req.params.pageNumber);
    return json(res, true, { message: 'Страница подтверждена' });
  }),
);

router.get(
  '/price-check/report',
  requireAuth,
  asyncHandler(async (req, res) => {
    const items = await getPriceCheckReportRows();
    return json(res, true, { generatedAt: Date.now(), items });
  }),
);

router.get(
  '/price-check/print',
  requireAuth,
  asyncHandler(async (req, res) => {
    const items = await getPriceCheckReportRows();
    await logUserAction(req.user.id, 'print', { module: 'price_check' });
    return json(res, true, { generatedAt: Date.now(), items });
  }),
);

export default router;
