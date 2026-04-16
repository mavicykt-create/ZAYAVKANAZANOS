import { Router } from 'express';
import authRoutes from './authRoutes.js';
import catalogRoutes from './catalogRoutes.js';
import carryRoutes from './carryRoutes.js';
import priceCheckRoutes from './priceCheckRoutes.js';
import productCheckRoutes from './productCheckRoutes.js';
import adminRoutes from './adminRoutes.js';
import calendarRoutes from './calendarRoutes.js';

const router = Router();
router.use('/auth', authRoutes);
router.use('/catalog', catalogRoutes);
router.use('/carry', carryRoutes);
router.use('/price-check', priceCheckRoutes);
router.use('/product-check', productCheckRoutes);
router.use('/admin', adminRoutes);
router.use('/calendar', calendarRoutes);

export default router;
