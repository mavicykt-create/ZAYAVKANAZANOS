import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getProductsWithoutBarcode, hideProductFromProductCheck } from '../services/productCheckService.js';
import { asyncHandler, json } from '../utils/http.js';
import { logUserAction } from '../services/actionLogService.js';

const router = Router();

router.get(
  '/product-check/no-barcode',
  requireAuth,
  asyncHandler(async (req, res) => {
    const products = await getProductsWithoutBarcode();
    return json(res, true, { products });
  }),
);

router.post(
  '/product-check/items/:id/hide',
  requireAuth,
  asyncHandler(async (req, res) => {
    await hideProductFromProductCheck(req.params.id);
    await logUserAction(req.user.id, 'issue', {
      module: 'product_check',
      entityId: String(req.params.id),
      scoreDelta: -5,
    });
    return json(res, true, { message: 'Товар скрыт из проверки товара' });
  }),
);

export default router;
