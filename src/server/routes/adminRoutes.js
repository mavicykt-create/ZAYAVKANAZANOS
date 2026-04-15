import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import {
  buildAdminOverview,
  clearCatalogImageCache,
  createUser,
  listProblemProducts,
  listUsers,
  toggleUserActive,
  updateUser,
} from '../services/adminService.js';
import { getLockedPricePages, unlockPriceCheckPage } from '../services/priceCheckService.js';
import { resetCatalogSync } from '../services/catalogService.js';
import { asyncHandler, json } from '../utils/http.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get(
  '/admin/overview',
  asyncHandler(async (req, res) => {
    const overview = await buildAdminOverview();
    return json(res, true, { overview });
  }),
);

router.get(
  '/admin/users',
  asyncHandler(async (req, res) => {
    const users = await listUsers();
    return json(res, true, { users });
  }),
);

router.post(
  '/admin/users',
  asyncHandler(async (req, res) => {
    await createUser(req.body || {});
    return json(res, true, { message: 'Пользователь создан' });
  }),
);

router.patch(
  '/admin/users/:id',
  asyncHandler(async (req, res) => {
    await updateUser(req.params.id, req.body || {});
    return json(res, true, { message: 'Пользователь обновлён' });
  }),
);

router.post(
  '/admin/users/:id/toggle-active',
  asyncHandler(async (req, res) => {
    const active = await toggleUserActive(req.params.id);
    return json(res, true, { active, message: active ? 'Пользователь включен' : 'Пользователь отключен' });
  }),
);

router.get(
  '/admin/price-locks',
  asyncHandler(async (req, res) => {
    const locks = await getLockedPricePages();
    return json(res, true, { locks });
  }),
);

router.post(
  '/admin/unlock-price-page',
  asyncHandler(async (req, res) => {
    const categoryId = Number(req.body?.categoryId);
    const pageNumber = Number(req.body?.pageNumber);
    await unlockPriceCheckPage(categoryId, pageNumber, req.user.id, true);
    return json(res, true, { message: 'Страница разблокирована' });
  }),
);

router.post(
  '/admin/clear-image-cache',
  asyncHandler(async (req, res) => {
    const removed = await clearCatalogImageCache();
    return json(res, true, { removed, message: `Кэш очищен: ${removed}` });
  }),
);

router.post(
  '/admin/sync-reset',
  asyncHandler(async (req, res) => {
    await resetCatalogSync();
    return json(res, true, { message: 'Синхронизация сброшена' });
  }),
);

router.get(
  '/admin/problem-products',
  asyncHandler(async (req, res) => {
    const products = await listProblemProducts();
    return json(res, true, { products });
  }),
);

export default router;
