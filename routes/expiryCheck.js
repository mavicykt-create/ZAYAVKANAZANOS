const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Получить товары со сроком годности менее 60 дней
router.get('/expiring-soon', requireAuth, (req, res) => {
  const db = getDB();
  
  // Получаем все товары у которых есть срок годности
  const products = db.prepare(`
    SELECT 
      p.id, p.name, p.vendor_code, p.picture, p.expiry_date,
      p.category_id, c.name as category_name,
      ec.new_expiry, ec.is_confirmed
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN expiry_checks ec ON p.id = ec.product_id
    WHERE p.expiry_date IS NOT NULL AND p.expiry_date != ''
    ORDER BY c.name, p.name
  `).all();

  // Фильтруем те, что менее 60 дней
  const now = new Date();
  const cutoffDate = new Date();
  cutoffDate.setDate(now.getDate() + 60);

  const expiringProducts = products.filter(p => {
    const expiry = new Date(p.expiry_date);
    return expiry <= cutoffDate;
  });

  res.json(expiringProducts);
});

// Подтвердить или изменить срок годности
router.post('/check', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;
  const { productId, newExpiry, isConfirmed } = req.body;

  if (!productId) {
    return res.status(400).json({ error: 'Укажите товар' });
  }

  // Получаем оригинальный срок годности
  const product = db.prepare('SELECT expiry_date FROM products WHERE id = ?').get(productId);
  
  db.prepare(`
    INSERT OR REPLACE INTO expiry_checks 
    (product_id, checked_by, original_expiry, new_expiry, is_confirmed, checked_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    productId, 
    userId, 
    product?.expiry_date || '', 
    newExpiry || null, 
    isConfirmed ? 1 : 0
  );

  res.json({ success: true });
});

// Получить результаты проверки (админ)
router.get('/results', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();

  const results = db.prepare(`
    SELECT 
      ec.*, p.name as product_name, p.vendor_code, 
      c.name as category_name, u.login as checked_by_name
    FROM expiry_checks ec
    JOIN products p ON ec.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    JOIN users u ON ec.checked_by = u.id
    ORDER BY ec.checked_at DESC
  `).all();

  res.json(results);
});

// Очистить проверки (админ)
router.post('/clear', requireAuth, requireAdmin, (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM expiry_checks').run();
  res.json({ success: true });
});

module.exports = router;
