import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { getCategories, getProductsByCategory, getCatalogStats } from '../services/catalogService.js';
import { getSyncState } from '../services/syncService.js';

const router = Router();
router.use(authRequired);

router.get('/categories', async (_req, res, next) => {
  try { res.json({ ok: true, items: await getCategories() }); } catch (error) { next(error); }
});
router.get('/categories/:categoryId/products', async (req, res, next) => {
  try { res.json({ ok: true, items: await getProductsByCategory(Number(req.params.categoryId)) }); } catch (error) { next(error); }
});
router.get('/stats', async (_req, res, next) => {
  try { res.json({ ok: true, ...(await getCatalogStats()) }); } catch (error) { next(error); }
});
router.get('/sync-state', async (_req, res, next) => {
  try { res.json({ ok: true, item: await getSyncState() }); } catch (error) { next(error); }
});

export default router;
