import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { hideFromProductCheck, listProductsWithoutBarcode } from '../services/productCheckService.js';

const router = Router();
router.use(authRequired);

router.get('/', async (_req, res, next) => {
  try { res.json({ ok: true, items: await listProductsWithoutBarcode() }); } catch (error) { next(error); }
});
router.post('/hide', async (req, res, next) => {
  try {
    await hideFromProductCheck(req.user.id, Number(req.body.productId));
    res.json({ ok: true });
  } catch (error) { next(error); }
});

export default router;
