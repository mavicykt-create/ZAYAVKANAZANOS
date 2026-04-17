const express = require('express');
const { getDB } = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Get carry requests for user
router.get('/requests', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;

  const requests = db.prepare(`
    SELECT cr.*, p.name as product_name, p.vendor_code, p.picture,
           c.name as category_name
    FROM carry_requests cr
    JOIN products p ON cr.product_id = p.id
    JOIN categories c ON cr.category_id = c.id
    WHERE cr.user_id = ? AND cr.status = 'pending'
    ORDER BY cr.created_at DESC
  `).all(userId);

  res.json(requests);
});

// Add/update carry request
router.post('/request', requireAuth, (req, res) => {
  const { categoryId, productId, quantity } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  // Check if request exists
  const existing = db.prepare(`
    SELECT id, quantity FROM carry_requests 
    WHERE user_id = ? AND product_id = ? AND status = 'pending'
  `).get(userId, productId);

  if (existing) {
    if (quantity <= 0) {
      db.prepare('DELETE FROM carry_requests WHERE id = ?').run(existing.id);
    } else {
      db.prepare('UPDATE carry_requests SET quantity = ? WHERE id = ?')
        .run(quantity, existing.id);
    }
  } else if (quantity > 0) {
    db.prepare(`
      INSERT INTO carry_requests (user_id, category_id, product_id, quantity)
      VALUES (?, ?, ?, ?)
    `).run(userId, categoryId, productId, quantity);
  }

  // Log action
  const actionType = quantity > (existing?.quantity || 0) ? 'increment' : 'decrement';
  db.prepare('INSERT INTO user_actions_log (user_id, action_type, details) VALUES (?, ?, ?)')
    .run(userId, actionType, JSON.stringify({ productId, quantity }));

  res.json({ success: true, quantity });
});

// Complete category - помечаем категорию как готовую, но НЕ меняем статус товаров
// товары остаются 'pending' чтобы быть видимыми в сборке
router.post('/complete-category', requireAuth, (req, res) => {
  const { categoryId } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  // Проверяем что есть товары в категории
  const hasItems = db.prepare(`
    SELECT COUNT(*) as count FROM carry_requests 
    WHERE user_id = ? AND category_id = ? AND status = 'pending' AND quantity > 0
  `).get(userId, categoryId).count;

  if (hasItems === 0) {
    return res.status(400).json({ error: 'Нет товаров в категории' });
  }

  // Log action - категория готова
  db.prepare('INSERT INTO user_actions_log (user_id, action_type, details) VALUES (?, ?, ?)')
    .run(userId, 'complete_category', JSON.stringify({ categoryId }));

  // Update stats
  updateUserStats(userId, 'carry_categories');

  res.json({ success: true });
});

// Get assembly list - ВСЕ pending заявки пользователя
router.get('/assembly', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.userId;

  console.log('Getting assembly for user:', userId);

  const items = db.prepare(`
    SELECT cr.id, cr.quantity, cr.product_id, cr.category_id,
           p.name as product_name, p.vendor_code, p.picture,
           c.name as category_name
    FROM carry_requests cr
    JOIN products p ON cr.product_id = p.id
    JOIN categories c ON cr.category_id = c.id
    WHERE cr.user_id = ? AND cr.status = 'pending' AND cr.quantity > 0
    ORDER BY c.name, p.name
  `).all(userId);

  console.log('Found items:', items.length);

  res.json(items);
});

// Mark items as collected
router.post('/mark-collected', requireAuth, (req, res) => {
  const { requestIds } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  const stmt = db.prepare(`
    UPDATE carry_requests SET status = 'collected'
    WHERE id = ? AND user_id = ?
  `);

  requestIds.forEach(id => {
    stmt.run(id, userId);
  });

  res.json({ success: true });
});

// Complete order
router.post('/complete-order', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const db = getDB();

  db.prepare(`
    UPDATE carry_requests 
    SET status = 'completed', completed_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND status = 'collected'
  `).run(userId);

  // Log action
  db.prepare('INSERT INTO user_actions_log (user_id, action_type) VALUES (?, ?)')
    .run(userId, 'complete_order');

  res.json({ success: true });
});

// Get print data for category
router.get('/print/:categoryId', requireAuth, (req, res) => {
  const { categoryId } = req.params;
  const userId = req.session.userId;
  const db = getDB();

  const items = db.prepare(`
    SELECT cr.quantity, p.name, p.vendor_code, c.name as category_name
    FROM carry_requests cr
    JOIN products p ON cr.product_id = p.id
    JOIN categories c ON cr.category_id = c.id
    WHERE cr.user_id = ? AND cr.category_id = ? AND cr.status = 'pending'
    ORDER BY p.name
  `).all(userId, categoryId);

  res.json({
    date: new Date().toLocaleString('ru-RU'),
    category: items[0]?.category_name || '',
    items
  });
});

// Get ALL print data (все категории) - для сборки ВСЕХ пользователей
router.get('/print-all', requireAuth, (req, res) => {
  const db = getDB();

  // Получаем ВСЕ товары от ВСЕХ пользователей с группировкой по продукту
  const items = db.prepare(`
    SELECT 
      SUM(cr.quantity) as quantity,
      p.name,
      p.vendor_code,
      c.name as category_name
    FROM carry_requests cr
    JOIN products p ON cr.product_id = p.id
    JOIN categories c ON cr.category_id = c.id
    WHERE cr.status = 'pending' AND cr.quantity > 0
    GROUP BY cr.product_id
    ORDER BY c.name, p.name
  `).all();

  res.json({
    date: new Date().toLocaleString('ru-RU'),
    items
  });
});

function updateUserStats(userId, field) {
  const db = getDB();
  const today = new Date().toISOString().split('T')[0];

  db.prepare(`
    INSERT INTO user_daily_stats (user_id, date, ${field})
    VALUES (?, ?, 1)
    ON CONFLICT(user_id, date) DO UPDATE SET
    ${field} = ${field} + 1
  `).run(userId, today);
}

// ===== НОВЫЕ ENDPOINTS ДЛЯ СОВМЕСТНОЙ РАБОТЫ =====

// Get ALL carry requests from ALL users (for collaborative work)
router.get('/all-requests', requireAuth, (req, res) => {
  const db = getDB();

  const requests = db.prepare(`
    SELECT cr.*, p.name as product_name, p.vendor_code, p.picture,
           c.name as category_name, u.login as user_login
    FROM carry_requests cr
    JOIN products p ON cr.product_id = p.id
    JOIN categories c ON cr.category_id = c.id
    JOIN users u ON cr.user_id = u.id
    WHERE cr.status = 'pending' AND cr.quantity > 0
    ORDER BY c.name, p.name, cr.created_at DESC
  `).all();

  res.json(requests);
});

// Get category statistics (for showing progress in category list)
router.get('/category-stats/:categoryId', requireAuth, (req, res) => {
  const { categoryId } = req.params;
  const db = getDB();

  // Get total items and quantity in category
  const stats = db.prepare(`
    SELECT 
      COUNT(DISTINCT cr.product_id) as total_items,
      SUM(cr.quantity) as total_quantity,
      COUNT(DISTINCT cr.user_id) as total_users
    FROM carry_requests cr
    WHERE cr.category_id = ? AND cr.status = 'pending' AND cr.quantity > 0
  `).get(categoryId);

  // Get users who contributed to this category
  const users = db.prepare(`
    SELECT 
      u.login,
      COUNT(DISTINCT cr.product_id) as items_count,
      SUM(cr.quantity) as quantity_count
    FROM carry_requests cr
    JOIN users u ON cr.user_id = u.id
    WHERE cr.category_id = ? AND cr.status = 'pending' AND cr.quantity > 0
    GROUP BY u.id
    ORDER BY quantity_count DESC
  `).all(categoryId);

  // Check if category is marked as completed by any user
  const completed = db.prepare(`
    SELECT COUNT(*) as count FROM completed_categories 
    WHERE category_id = ?
  `).get(categoryId);

  res.json({
    category_id: parseInt(categoryId),
    total_items: stats?.total_items || 0,
    total_quantity: stats?.total_quantity || 0,
    total_users: stats?.total_users || 0,
    is_completed: completed.count > 0,
    users: users || []
  });
});

// Get status of all categories (for showing checkmarks)
router.get('/categories-status', requireAuth, (req, res) => {
  const db = getDB();

  const categories = db.prepare(`
    SELECT 
      c.id as category_id,
      c.name as category_name,
      COUNT(DISTINCT cr.product_id) as total_items,
      COUNT(DISTINCT CASE WHEN cc.id IS NOT NULL THEN cr.product_id END) as completed_items,
      COUNT(DISTINCT cr.user_id) as users_count,
      GROUP_CONCAT(DISTINCT u.login) as user_names
    FROM categories c
    LEFT JOIN carry_requests cr ON c.id = cr.category_id AND cr.status = 'pending' AND cr.quantity > 0
    LEFT JOIN users u ON cr.user_id = u.id
    LEFT JOIN completed_categories cc ON c.id = cc.category_id
    GROUP BY c.id
    ORDER BY c.name
  `).all();

  res.json({
    categories: categories.map(c => ({
      ...c,
      user_names: c.user_names ? c.user_names.split(',') : [],
      is_fully_completed: c.completed_items > 0 && c.completed_items >= c.total_items && c.total_items > 0
    }))
  });
});

// Mark category as completed (collaborative)
router.post('/complete-category-collab', requireAuth, (req, res) => {
  const { categoryId } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  // Check if category has items
  const hasItems = db.prepare(`
    SELECT COUNT(*) as count FROM carry_requests 
    WHERE category_id = ? AND status = 'pending' AND quantity > 0
  `).get(categoryId).count;

  if (hasItems === 0) {
    return res.status(400).json({ error: 'Нет товаров в категории' });
  }

  // Mark category as completed
  db.prepare(`
    INSERT OR REPLACE INTO completed_categories (category_id, user_id, completed_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(categoryId, userId);

  // Log action
  db.prepare('INSERT INTO user_actions_log (user_id, action_type, details) VALUES (?, ?, ?)')
    .run(userId, 'complete_category_collab', JSON.stringify({ categoryId }));

  // Update stats
  updateUserStats(userId, 'carry_categories');

  res.json({ success: true, message: 'Категория отмечена как завершённая' });
});

// Unmark category as completed
router.post('/uncomplete-category', requireAuth, (req, res) => {
  const { categoryId } = req.body;
  const db = getDB();

  db.prepare('DELETE FROM completed_categories WHERE category_id = ?').run(categoryId);

  res.json({ success: true });
});

// Get assembly list - ALL items from ALL users (grouped by product)
router.get('/assembly-all', requireAuth, (req, res) => {
  const db = getDB();

  const items = db.prepare(`
    SELECT 
      cr.product_id,
      p.name as product_name,
      p.vendor_code,
      p.picture,
      c.name as category_name,
      SUM(cr.quantity) as total_quantity,
      COUNT(DISTINCT cr.user_id) as users_count,
      GROUP_CONCAT(DISTINCT u.login || ':' || cr.quantity) as contributions
    FROM carry_requests cr
    JOIN products p ON cr.product_id = p.id
    JOIN categories c ON cr.category_id = c.id
    JOIN users u ON cr.user_id = u.id
    WHERE cr.status = 'pending' AND cr.quantity > 0
    GROUP BY cr.product_id
    ORDER BY c.name, p.name
  `).all();

  // Parse contributions
  const parsedItems = items.map(item => {
    const contributions = item.contributions ? item.contributions.split(',').map(c => {
      const [login, qty] = c.split(':');
      return { login, quantity: parseInt(qty) || 0 };
    }) : [];
    return { ...item, contributions };
  });

  res.json(parsedItems);
});

// Toggle collected status for an item (synced across all users)
router.post('/toggle-collected', requireAuth, (req, res) => {
  const { productId, collected } = req.body;
  const userId = req.session.userId;
  const db = getDB();

  if (collected) {
    db.prepare(`
      INSERT OR REPLACE INTO collected_items (product_id, user_id, collected_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(productId, userId);
  } else {
    db.prepare('DELETE FROM collected_items WHERE product_id = ?').run(productId);
  }

  res.json({ success: true, productId, collected });
});

// Get all collected items
router.get('/collected-items', requireAuth, (req, res) => {
  const db = getDB();

  const items = db.prepare(`
    SELECT product_id, user_id, collected_at
    FROM collected_items
  `).all();

  res.json(items);
});

// Clear all carry requests (for new assembly session)
router.post('/clear-all', requireAuth, (req, res) => {
  const db = getDB();

  // Only admin can clear all
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Только администратор может очистить все заявки' });
  }

  db.prepare("UPDATE carry_requests SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE status = 'pending'").run();
  db.prepare('DELETE FROM completed_categories').run();
  db.prepare('DELETE FROM collected_items').run();

  res.json({ success: true, message: 'Все заявки очищены' });
});

// ===== API ДЛЯ ЦВЕТНЫХ КРУЖКОВ =====

// Get all user colors
router.get('/user-colors', requireAuth, (req, res) => {
  const db = getDB();
  
  const colors = db.prepare(`
    SELECT u.id as user_id, u.login, uc.color
    FROM users u
    LEFT JOIN user_colors uc ON u.id = uc.user_id
    WHERE u.is_active = 1
  `).all();
  
  res.json(colors);
});

// Save product click with user color
router.post('/product-click', requireAuth, (req, res) => {
  const { productId, categoryId } = req.body;
  const userId = req.session.userId;
  const db = getDB();
  
  db.prepare(`
    INSERT OR REPLACE INTO product_clicks (product_id, user_id, category_id)
    VALUES (?, ?, ?)
  `).run(productId, userId, categoryId);
  
  res.json({ success: true });
});

// Get all product clicks for a category
router.get('/product-clicks/:categoryId', requireAuth, (req, res) => {
  const { categoryId } = req.params;
  const db = getDB();
  
  const clicks = db.prepare(`
    SELECT pc.product_id, pc.user_id, u.login, uc.color
    FROM product_clicks pc
    JOIN users u ON pc.user_id = u.id
    LEFT JOIN user_colors uc ON u.id = uc.user_id
    WHERE pc.category_id = ?
  `).all(categoryId);
  
  res.json(clicks);
});

// Get all product clicks (for all categories)
router.get('/product-clicks-all', requireAuth, (req, res) => {
  const db = getDB();
  
  const clicks = db.prepare(`
    SELECT pc.product_id, pc.user_id, u.login, uc.color
    FROM product_clicks pc
    JOIN users u ON pc.user_id = u.id
    LEFT JOIN user_colors uc ON u.id = uc.user_id
  `).all();
  
  res.json(clicks);
});

// Complete order and reset all counters
router.post('/complete-order-reset', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const db = getDB();
  
  // Mark collected items as completed
  db.prepare(`
    UPDATE carry_requests 
    SET status = 'completed', completed_at = CURRENT_TIMESTAMP
    WHERE status = 'collected'
  `).run();
  
  // Delete all remaining pending requests (reset counters)
  db.prepare("DELETE FROM carry_requests WHERE status = 'pending'").run();
  
  // Clear completed categories
  db.prepare('DELETE FROM completed_categories').run();
  
  // Clear collected items
  db.prepare('DELETE FROM collected_items').run();
  
  // Clear product clicks
  db.prepare('DELETE FROM product_clicks').run();
  
  // Log action
  db.prepare('INSERT INTO user_actions_log (user_id, action_type) VALUES (?, ?)')
    .run(userId, 'complete_order_reset');
  
  res.json({ success: true, message: 'Сборка завершена и все счетчики сброшены' });
});

module.exports = router;
