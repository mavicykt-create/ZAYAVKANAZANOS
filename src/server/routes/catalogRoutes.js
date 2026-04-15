import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { getSyncState } from '../services/appStateService.js';
import {
  getCatalogCategories,
  nextSyncAllowedAt,
  resetCatalogSync,
  startCatalogSync,
} from '../services/catalogService.js';
import { asyncHandler, json } from '../utils/http.js';

const router = Router();

router.get(
  '/catalog/categories',
  requireAuth,
  asyncHandler(async (req, res) => {
    const categories = await getCatalogCategories();
    return json(res, true, { categories });
  }),
);

router.get(
  '/catalog/sync-status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sync = await getSyncState();
    return json(res, true, {
      sync: {
        ...sync,
        nextAllowedAt: nextSyncAllowedAt(sync),
      },
    });
  }),
);

router.post(
  '/catalog/sync-yml',
  requireAuth,
  asyncHandler(async (req, res) => {
    await startCatalogSync();
    return json(res, true, { message: 'Обновление каталога запущено' });
  }),
);

router.post(
  '/catalog/sync-reset',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await resetCatalogSync();
    return json(res, true, { message: 'Синхронизация сброшена' });
  }),
);

export default router;
