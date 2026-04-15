import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import {
  getPushConfig,
  removePushSubscription,
  savePushSubscription,
  sendPushToAll,
  sendPushToUser,
} from '../services/pushService.js';
import { asyncHandler, json } from '../utils/http.js';

const router = Router();

router.get('/push/config', requireAuth, (req, res) => {
  const configData = getPushConfig();
  return json(res, true, {
    configured: configData.configured,
    publicKey: configData.publicKey,
  });
});

router.get('/push/vapid-public-key', requireAuth, (req, res) => {
  const configData = getPushConfig();
  return json(res, true, {
    configured: configData.configured,
    publicKey: configData.publicKey,
  });
});

router.post(
  '/push/subscribe',
  requireAuth,
  asyncHandler(async (req, res) => {
    await savePushSubscription(req.user.id, req.body?.subscription || {});
    return json(res, true, { message: 'Подписка сохранена' });
  }),
);

router.post(
  '/push/unsubscribe',
  requireAuth,
  asyncHandler(async (req, res) => {
    await removePushSubscription(req.body?.endpoint || '');
    return json(res, true, { message: 'Подписка удалена' });
  }),
);

router.post(
  '/admin/push/send-all',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await sendPushToAll(req.body || {});
    return json(res, true, result);
  }),
);

router.post(
  '/admin/push/send-user/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await sendPushToUser(req.params.id, req.body || {});
    return json(res, true, result);
  }),
);

export default router;
