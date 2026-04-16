import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { getPriceCheckPages, openPriceCheckPage, problemItems, releasePriceCheckPage, togglePriceCheckMark } from '../services/priceCheckService.js';
import { logAction } from '../services/statsService.js';

const router = Router();
router.use(authRequired);

router.get('/pages', async (_req, res, next) => {
  try { res.json({ ok: true, items: await getPriceCheckPages() }); } catch (error) { next(error); }
});
router.post('/pages/open', async (req, res, next) => {
  try {
    const data = await openPriceCheckPage({ userId: req.user.id, categoryId: Number(req.body.categoryId), pageNumber: Number(req.body.pageNumber) });
    res.json({ ok: true, ...data });
  } catch (error) { next(error); }
});
router.post('/toggle', async (req, res, next) => {
  try {
    const item = await togglePriceCheckMark({ userId: req.user.id, productId: Number(req.body.productId), markType: req.body.markType });
    res.json({ ok: true, item });
  } catch (error) { next(error); }
});
router.post('/pages/release', async (req, res, next) => {
  try {
    await releasePriceCheckPage({ userId: req.user.id, categoryId: Number(req.body.categoryId), pageNumber: Number(req.body.pageNumber) });
    res.json({ ok: true });
  } catch (error) { next(error); }
});
router.get('/problems', async (_req, res, next) => {
  try { res.json({ ok: true, items: await problemItems() }); } catch (error) { next(error); }
});
router.post('/print-log', async (req, res, next) => {
  try {
    await logAction({ userId: req.user.id, action: 'print', module: 'price-check', payload: req.body || {} });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

export default router;
