import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { changeCarryQty, completeCarryCategory, completeCarryOrder, getCarryAssembly, getCarryCategoryState } from '../services/carryService.js';
import { logAction } from '../services/statsService.js';

const router = Router();
router.use(authRequired);

router.get('/category/:categoryId', async (req, res, next) => {
  try {
    const items = await getCarryCategoryState(req.user.id, Number(req.params.categoryId));
    res.json({ ok: true, items });
  } catch (error) { next(error); }
});

router.post('/change', async (req, res, next) => {
  try {
    const item = await changeCarryQty({ userId: req.user.id, categoryId: Number(req.body.categoryId), productId: Number(req.body.productId), direction: req.body.direction });
    res.json({ ok: true, item });
  } catch (error) { next(error); }
});

router.post('/complete-category', async (req, res, next) => {
  try {
    await completeCarryCategory(req.user.id, Number(req.body.categoryId));
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.get('/assembly', async (req, res, next) => {
  try {
    res.json({ ok: true, items: await getCarryAssembly(req.user.id) });
  } catch (error) { next(error); }
});

router.post('/complete-order', async (req, res, next) => {
  try {
    await completeCarryOrder(req.user.id);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.post('/print-log', async (req, res, next) => {
  try {
    await logAction({ userId: req.user.id, action: 'print', module: 'carry', payload: req.body || {} });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

export default router;
