// ZAN 1.1 - Main Application (Apple Design) - СОВМЕСТНАЯ РАБОТА
const API_URL = '';

// State
let currentUser = null;
let currentView = 'login';

let currentCategoryId = null;
let currentCategoryName = '';
let currentProducts = [];
let currentPageNumber = null;
let collectedIds = new Set();

// Хранение завершённых категорий (загружается с сервера)
let completedCategories = {}; // { categoryId: { count: number, total: number, users: [] } }

// Кэш изображений для предотвращения мигания
const imageCache = new Map();
let preloadedImages = new Set();

// Цвета пользователей для кружков
let userColors = {}; // { userId: color }
let productClicks = {}; // { productId: { userId, color, login } }

// Текущая страница проверки ценников
let priceCheckCurrentPage = 1;
let priceCheckTotalPages = 1;
let priceCheckMarks = {}; // { productId: markType }

// Initialize
async function init() {
  const user = await apiGet('/api/auth/me');
  if (user) {
    currentUser = user;
    showMainMenu();
  } else {
    showLogin();
  }
}

// API Helpers
async function apiGet(endpoint) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, { credentials: 'include' });
    if (res.status === 401) return null;
    return await res.json();
  } catch (e) {
    console.error('API Error:', e);
    return null;
  }
}

async function apiPost(endpoint, data) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch (e) {
    console.error('API Error:', e);
    return { error: e.message };
  }
}

// Image Helper с кэшированием для предотвращения мигания
function getImageUrl(picture) {
  if (!picture) return '/icons/icon-192x192.png';
  if (picture.startsWith('http')) return picture;
  if (picture.startsWith('/')) return picture;
  return '/icons/icon-192x192.png';
}

// Предзагрузка изображения для предотвращения мигания
function preloadImage(src) {
  if (!src || preloadedImages.has(src)) return;
  const img = new Image();
  img.src = src;
  preloadedImages.add(src);
}

// Создание кэшированного изображения без мигания
function createCachedImage(src, className, alt = '') {
  const cachedSrc = imageCache.get(src);
  if (cachedSrc) {
    return `<img src="${cachedSrc}" class="${className}" alt="${alt}" decoding="async" style="transition: none !important; animation: none !important;">`;
  }
  
  // Предзагружаем для следующего раза
  preloadImage(src);
  
  return `<img src="${src}" class="${className}" alt="${alt}" decoding="async" loading="lazy" 
    onload="imageCache.set('${src}', this.src)" 
    onerror="this.src='/icons/icon-192x192.png'; this.onerror=null;"
    style="transition: none !important; animation: none !important;">`;
}

// Views
function renderApp() {
  const app = document.getElementById('app');
  switch (currentView) {
    case 'login': app.innerHTML = renderLogin(); break;
    case 'menu': app.innerHTML = renderMainMenu(); break;
    case 'carry-categories': app.innerHTML = renderCarryCategories(); break;
    case 'carry-products': app.innerHTML = renderCarryProducts(); break;
    case 'carry-assembly': app.innerHTML = renderCarryAssembly(); break;
    case 'price-check-categories': app.innerHTML = renderPriceCheckCategories(); break;
    case 'price-check-new': app.innerHTML = renderPriceCheckCategories(); break;
    case 'price-check-pages': app.innerHTML = renderPriceCheckPages(); break;
    case 'price-check-products': app.innerHTML = renderPriceCheckProducts(); break;
    case 'product-check': app.innerHTML = renderProductCheck(); break;
    case 'calendar': app.innerHTML = renderCalendar(); break;
    case 'admin': app.innerHTML = renderAdmin(); break;
    case 'print': app.innerHTML = renderPrint(); break;
  }
}

// Login View
function renderLogin() {
  return `<div class="login-screen">
    <div class="login-logo">ZAN 1.1</div>
    <div class="login-subtitle">Вход в систему</div>
    <form class="login-form" onsubmit="handleLogin(event)">
      <input type="text" class="login-input" id="login" placeholder="Логин" required autocomplete="username">
      <input type="password" class="login-input" id="password" placeholder="Пароль" required autocomplete="current-password">
      <button type="submit" class="login-btn">Войти</button>
    </form>
  </div>`;
}

async function handleLogin(e) {
  e.preventDefault();
  const login = document.getElementById('login').value;
  const password = document.getElementById('password').value;
  const result = await apiPost('/api/auth/login', { login, password });
  if (result.error) { alert('Неверный логин или пароль'); return; }
  currentUser = result;
  showMainMenu();
}

function showLogin() { currentView = 'login'; renderApp(); }

// Main Menu
function renderMainMenu() {
  const isAdmin = currentUser?.role === 'admin';
  return `<div class="main-layout">
    <div class="header">
      <div class="header-title">ZAN 1.1</div>
      <div class="header-user">
        <span style="color: var(--ios-gray); font-size: 15px; margin-right: 8px;">${currentUser.login}</span>
        <button class="logout-btn" onclick="handleLogout()">Выйти</button>
      </div>
    </div>
    <div class="menu-grid">
      <div class="menu-item" onclick="showCarryCategories()">
        <div class="menu-icon">📦</div>
        <div class="menu-label">Заявка на занос</div>
      </div>
      <div class="menu-item" onclick="showPriceCheckCategories()">
        <div class="menu-icon">🏷️</div>
        <div class="menu-label">Проверка ценников</div>
      </div>
      <div class="menu-item" onclick="showProductCheck()">
        <div class="menu-icon">📋</div>
        <div class="menu-label">Проверка товара</div>
      </div>
      <div class="menu-item" onclick="showCalendar()">
        <div class="menu-icon">📅</div>
        <div class="menu-label">Календарь недели</div>
      </div>
      ${isAdmin ? `<div class="menu-item" onclick="showAdmin()">
        <div class="menu-icon">⚙️</div>
        <div class="menu-label">Админка</div>
      </div>` : ''}
    </div>
    <button class="install-btn" id="installBtn" style="display:none" onclick="installApp()">Установить приложение</button>
  </div>`;
}

function showMainMenu() { currentView = 'menu'; renderApp(); checkInstallPrompt(); }
async function handleLogout() { await apiPost('/api/auth/logout', {}); currentUser = null; showLogin(); }

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; const btn = document.getElementById('installBtn'); if (btn) btn.style.display = 'block'; });
async function installApp() { if (!deferredPrompt) return; deferredPrompt.prompt(); const result = await deferredPrompt.userChoice; if (result.outcome === 'accepted') { document.getElementById('installBtn').style.display = 'none'; } deferredPrompt = null; }
function checkInstallPrompt() { if (deferredPrompt) { const btn = document.getElementById('installBtn'); if (btn) btn.style.display = 'block'; } }

// ===== ЗАЯВКА НА ЗАНОС - СОВМЕСТНАЯ РАБОТА =====

// Carry Categories - показываем статус всех категорий с сервера
async function showCarryCategories() {
  currentView = 'carry-categories'; renderApp();
  
  // Загружаем категории и их статус
  const [categories, statusData] = await Promise.all([
    apiGet('/api/catalog/categories'),
    apiGet('/api/carry/categories-status')
  ]);
  
  const list = document.getElementById('categoriesList');
  if (list && categories) {
    // Создаем мапу статусов
    const statusMap = {};
    if (statusData && statusData.categories) {
      statusData.categories.forEach(s => {
        statusMap[s.category_id] = s;
      });
    }
    
    list.innerHTML = categories.map(c => {
      const status = statusMap[c.id];
      const totalItems = status?.total_items || 0;
      const isCompleted = status?.is_fully_completed || false;
      const userNames = status?.user_names || [];
      
      let statusHtml = '';
      if (totalItems > 0) {
        const usersText = userNames.length > 0 ? ` - ${userNames.slice(0, 2).join(', ')}${userNames.length > 2 ? '...' : ''}` : '';
        statusHtml = `<span class="category-status">${totalItems} поз.${usersText}</span>`;
      }
      
      return `<div class="category-item ${isCompleted ? 'completed' : ''} ${totalItems > 0 ? 'has-items' : ''}" onclick="showCarryProducts(${c.id}, '${c.name}')">
        <div class="category-info">
          <span class="category-name">${isCompleted ? '✓ ' : ''}${c.name}</span>
          ${statusHtml}
        </div>
        <span class="category-arrow">›</span>
      </div>`;
    }).join('');
  }
}

function renderCarryCategories() {
  return `<div class="main-layout">
    <div class="header">
      <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
      <div class="header-title">Заявка на занос</div>
      <div></div>
    </div>
    <div class="categories-list" id="categoriesList"><div class="loading">Загрузка...</div></div>
    <div style="height: 80px;"></div>
    <div class="bottom-actions">
      <button class="btn btn-secondary" onclick="showCarryAssembly()">🛒 Сборка</button>
    </div>
  </div>`;
}

// Carry Products - показываем товары с общими количествами и цветными кружками
async function showCarryProducts(categoryId, categoryName) {
  currentCategoryId = categoryId; 
  currentCategoryName = categoryName; 
  currentView = 'carry-products'; 
  renderApp();
  
  document.getElementById('categoryTitle').textContent = categoryName;
  
  // Загружаем товары, мои заявки, статистику категории, цвета пользователей и клики
  const [products, myRequests, categoryStats, colorsData, clicksData] = await Promise.all([
    apiGet(`/api/catalog/products/${categoryId}`),
    apiGet('/api/carry/requests'),
    apiGet(`/api/carry/category-stats/${categoryId}`),
    apiGet('/api/carry/user-colors'),
    apiGet(`/api/carry/product-clicks/${categoryId}`)
  ]);
  
  currentProducts = products || [];
  
  // Сохраняем цвета пользователей
  userColors = {};
  if (colorsData) {
    colorsData.forEach(u => {
      userColors[u.user_id] = u.color || '#007AFF';
    });
  }
  
  // Сохраняем клики по товарам
  productClicks = {};
  if (clicksData) {
    clicksData.forEach(c => {
      productClicks[c.product_id] = {
        userId: c.user_id,
        color: c.color || '#007AFF',
        login: c.login
      };
    });
  }
  
  // Предзагружаем изображения для предотвращения мигания
  currentProducts.forEach(p => {
    if (p.picture) preloadImage(getImageUrl(p.picture));
  });
  
  // Мои количества
  window.currentQuantities = {};
  if (myRequests) {
    myRequests.forEach(r => {
      if (r.category_id === categoryId) {
        window.currentQuantities[r.product_id] = r.quantity;
      }
    });
  }
  
  // Общие количества от всех пользователей
  window.allQuantities = {};
  if (categoryStats && categoryStats.users) {
    // Здесь можно добавить логику для отображения общих количеств
  }
  
  // Показываем информацию о категории
  const statsEl = document.getElementById('categoryStats');
  if (statsEl && categoryStats) {
    const usersText = categoryStats.users?.map(u => `${u.login}: ${u.quantity_count}`).join(', ') || '';
    statsEl.innerHTML = `<div class="category-stats-bar">
      <span>Всего позиций: ${categoryStats.total_items || 0}</span>
      <span>Участников: ${categoryStats.total_users || 0}</span>
    </div>
    ${usersText ? `<div class="category-users">${usersText}</div>` : ''}`;
  }
  
  renderProductGrid();
}

function renderCarryProducts() {
  return `<div class="main-layout">
    <div class="header">
      <button class="back-btn" onclick="showCarryCategories()">‹ Назад</button>
      <div class="header-title" id="categoryTitle">Категория</div>
      <div></div>
    </div>
    <div id="categoryStats"></div>
    <div class="products-grid" id="productsGrid"></div>
    <div style="height: 80px;"></div>
    <div class="bottom-actions">
      <button class="btn btn-secondary" onclick="printCategory()">🖨️ Печать</button>
      <button class="btn btn-primary" onclick="confirmCategory()">✓ Готово</button>
    </div>
  </div>`;
}

function renderProductGrid() {
  const grid = document.getElementById('productsGrid'); 
  if (!grid) return;
  
  const quantities = window.currentQuantities || {};
  
  // Обновляем только изменившиеся элементы без полной перерисовки
  if (grid.children.length === currentProducts.length) {
    // Обновляем существующие карточки
    currentProducts.forEach((p, index) => {
      const qty = quantities[p.id] || 0;
      const card = grid.children[index];
      const qtyEl = card.querySelector('.product-qty-left');
      const clickEl = card.querySelector('.product-click-indicator');
      
      // Обновляем количество
      if (qty > 0) {
        if (qtyEl) {
          qtyEl.textContent = qty;
        } else {
          const step = p.name.includes('1/') ? 5 : 1;
          const newQtyEl = document.createElement('div');
          newQtyEl.className = 'product-qty-left';
          newQtyEl.textContent = qty;
          newQtyEl.onclick = (e) => { e.stopPropagation(); removeFromCarry(p.id, step); };
          card.appendChild(newQtyEl);
        }
      } else if (qtyEl) {
        qtyEl.remove();
      }
      
      // Обновляем цветной кружок клика
      const clickData = productClicks[p.id];
      if (clickData) {
        if (clickEl) {
          clickEl.style.backgroundColor = clickData.color;
        } else {
          const newClickEl = document.createElement('div');
          newClickEl.className = 'product-click-indicator';
          newClickEl.style.backgroundColor = clickData.color;
          newClickEl.title = `Нажал: ${clickData.login}`;
          card.appendChild(newClickEl);
        }
      }
    });
    return;
  }
  
  // Первая отрисовка
  grid.innerHTML = currentProducts.map(p => {
    const qty = quantities[p.id] || 0;
    const step = p.name.includes('1/') ? 5 : 1;
    const imgUrl = getImageUrl(p.picture);
    const clickData = productClicks[p.id];
    
    return `<div class="product-card" onclick="addToCarry(${p.id}, ${step})" data-product-id="${p.id}">
      ${createCachedImage(imgUrl, 'product-image', p.name)}
      ${qty > 0 ? `<div class="product-qty-left" onclick="event.stopPropagation(); removeFromCarry(${p.id}, ${step})">${qty}</div>` : ''}
      ${clickData ? `<div class="product-click-indicator" style="background-color: ${clickData.color}" title="Нажал: ${clickData.login}"></div>` : ''}
      <div class="product-info"><div class="product-name">${p.name}</div></div>
    </div>`;
  }).join('');
}

async function addToCarry(productId, step) {
  if (!window.currentQuantities) window.currentQuantities = {};
  window.currentQuantities[productId] = (window.currentQuantities[productId] || 0) + step;
  
  // Сохраняем клик с цветом пользователя
  await apiPost('/api/carry/product-click', { productId, categoryId: currentCategoryId });
  
  // Обновляем локальные данные о клике
  productClicks[productId] = {
    userId: currentUser.id,
    color: userColors[currentUser.id] || '#007AFF',
    login: currentUser.login
  };
  
  await apiPost('/api/carry/request', { categoryId: currentCategoryId, productId: productId, quantity: window.currentQuantities[productId] });
  renderProductGrid();
}

async function removeFromCarry(productId, step) {
  if (!window.currentQuantities) window.currentQuantities = {};
  window.currentQuantities[productId] = Math.max(0, (window.currentQuantities[productId] || 0) - step);
  await apiPost('/api/carry/request', { categoryId: currentCategoryId, productId: productId, quantity: window.currentQuantities[productId] });
  if (window.currentQuantities[productId] === 0) delete window.currentQuantities[productId];
  renderProductGrid();
}

async function confirmCategory() {
  const quantities = window.currentQuantities || {};
  const totalCount = Object.values(quantities).reduce((sum, q) => sum + q, 0);
  if (totalCount === 0) { alert('Выберите товары'); return; }
  
  await apiPost('/api/carry/complete-category-collab', { categoryId: currentCategoryId });
  
  window.currentQuantities = {};
  showCarryCategories();
}

// ПЕЧАТНАЯ ФОРМА категории
async function printCategory() {
  const data = await apiGet(`/api/carry/print/${currentCategoryId}`);
  if (!data || !data.items || data.items.length === 0) {
    alert('Нет товаров для печати');
    return;
  }
  window.printData = data;
  currentView = 'print'; renderApp();
}

function renderPrint() {
  const data = window.printData || { date: '', category: '', items: [] };
  const isAssembly = !data.category;
  return `<div class="main-layout">
    <div class="header">
      <button class="back-btn" onclick="${isAssembly ? 'showCarryAssembly()' : `showCarryProducts(${currentCategoryId}, '${currentCategoryName}')`}">‹ Назад</button>
      <div class="header-title">Печать</div>
      <button class="btn btn-primary" onclick="window.print()" style="padding: 8px 16px; font-size: 14px;">🖨️ Печать</button>
    </div>
    <div class="print-content" style="padding: 20px; background: white; color: black;">
      <h2 style="margin-bottom: 5px;">Заявка на занос</h2>
      <p style="color: #666; margin-bottom: 5px;">${data.date}</p>
      ${data.category ? `<p style="font-weight: bold; margin-bottom: 20px; font-size: 18px;">${data.category}</p>` : ''}
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="border-bottom: 2px solid #333;">
            <th style="text-align: left; padding: 8px;">№</th>
            <th style="text-align: left; padding: 8px;">Товар</th>
            <th style="text-align: left; padding: 8px;">Артикул</th>
            ${isAssembly ? '<th style="text-align: left; padding: 8px;">Категория</th>' : ''}
            <th style="text-align: center; padding: 8px;">Кол-во</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map((item, i) => `<tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px;">${i + 1}</td>
            <td style="padding: 8px;">${item.name}</td>
            <td style="padding: 8px; color: #666;">${item.vendor_code || '-'}</td>
            ${isAssembly ? `<td style="padding: 8px; color: #666;">${item.category_name || '-'}</td>` : ''}
            <td style="padding: 8px; text-align: center; font-weight: bold;">${item.quantity}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

// Carry Assembly - СБОРКА (СОВМЕСТНАЯ)
async function showCarryAssembly() { 
  currentView = 'carry-assembly'; renderApp(); 
  console.log('Loading assembly (collaborative)...');
  
  // Загружаем все товары от всех пользователей и собранные
  const [items, collected] = await Promise.all([
    apiGet('/api/carry/assembly-all'),
    apiGet('/api/carry/collected-items')
  ]);
  
  console.log('Assembly items (all users):', items);
  console.log('Collected items:', collected);
  
  // Обновляем collectedIds из сервера
  collectedIds = new Set((collected || []).map(i => i.product_id));
  
  renderAssemblyList(items); 
}

function renderCarryAssembly() { 
  return `<div class="main-layout">
    <div class="header">
      <button class="back-btn" onclick="showCarryCategories()">‹ Назад</button>
      <div class="header-title">Сборка</div>
      <button class="btn btn-secondary" onclick="printAssembly()" style="padding: 8px 16px; font-size: 14px;">🖨️ Печать</button>
    </div>
    <div id="assemblyStats"></div>
    <div id="assemblyList"></div>
    <div style="height: 80px;"></div>
    <div class="bottom-actions">
      <button class="btn btn-primary" onclick="completeOrder()">✓ Заявка собрана</button>
    </div>
  </div>`; 
}

function renderAssemblyList(items) {
  const container = document.getElementById('assemblyList'); 
  const statsEl = document.getElementById('assemblyStats');
  if (!container) return;

  console.log('Rendering assembly, items count:', items ? items.length : 0);

  if (!items || items.length === 0) { 
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div>Нет товаров в сборке<br><small style="color: var(--ios-gray);">Выберите товары в категориях</small></div>'; 
    if (statsEl) statsEl.innerHTML = '';
    return; 
  }

  // Статистика сборки
  const totalItems = items.length;
  const collectedCount = items.filter(i => collectedIds.has(i.product_id)).length;
  
  if (statsEl) {
    statsEl.innerHTML = `<div class="assembly-stats">
      <span>Собрано: ${collectedCount}/${totalItems}</span>
      <div class="progress-bar"><div class="progress-fill" style="width: ${(collectedCount/totalItems*100)}%"></div></div>
    </div>`;
  }

  container.innerHTML = items.map(item => {
    const isCollected = collectedIds.has(item.product_id);
    const contributors = item.contributions || [];
    const contributorsText = contributors.map(c => `${c.login}: ${c.quantity}`).join(', ');
    
    return `<div class="assembly-item ${isCollected ? 'collected' : ''}">
      <div class="assembly-content">
        <div>${item.product_name}</div>
        <div class="product-code">${item.vendor_code || ''} | ${item.category_name}</div>
        ${contributorsText ? `<div class="contributors">${contributorsText}</div>` : ''}
      </div>
      <div class="assembly-qty">${item.total_quantity}</div>
      <div class="assembly-checkbox ${isCollected ? 'checked' : ''}" id="cb-${item.product_id}" onclick="toggleCollectedGlobal(${item.product_id})"></div>
    </div>`;
  }).join('');
}

async function toggleCollectedGlobal(productId) {
  const isCollected = collectedIds.has(productId);
  const newCollected = !isCollected;
  
  // Обновляем UI сразу
  if (newCollected) {
    collectedIds.add(productId);
  } else {
    collectedIds.delete(productId);
  }
  
  const cb = document.getElementById(`cb-${productId}`);
  if (cb) {
    cb.classList.toggle('checked', newCollected);
  }
  
  // Обновляем статистику
  const items = await apiGet('/api/carry/assembly-all');
  renderAssemblyList(items);
  
  // Отправляем на сервер
  await apiPost('/api/carry/toggle-collected', { productId, collected: newCollected });
}

async function completeOrder() {
  if (collectedIds.size === 0) { alert('Отметьте собранные товары'); return; }
  
  // Используем новый endpoint для завершения и сброса
  const result = await apiPost('/api/carry/complete-order-reset', {});
  
  if (result.success) {
    alert('Сборка завершена! Все счетчики сброшены.'); 
    
    // Очищаем локальное состояние
    window.currentQuantities = {};
    collectedIds.clear();
    productClicks = {};
    currentCategoryId = null;
    currentCategoryName = '';
    currentProducts = [];
    
    showMainMenu();
  } else {
    alert('Ошибка: ' + (result.error || 'Не удалось завершить сборку'));
  }
}

// ПЕЧАТЬ СБОРКИ
async function printAssembly() {
  const data = await apiGet('/api/carry/print-all');
  console.log('Print assembly data:', data);
  if (!data || !data.items || data.items.length === 0) {
    alert('Нет товаров для печати');
    return;
  }
  window.printData = data;
  currentView = 'print'; renderApp();
}

// Price Check - НОВАЯ ЛОГИКА
async function showPriceCheckCategories() { 
  currentView = 'price-check-new'; 
  renderApp(); 
  loadPriceCheckNew();
}

function renderPriceCheckCategories() { 
  return `<div class="main-layout">
    <div class="header">
      <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
      <div class="header-title">Проверка ценников</div>
      <div></div>
    </div>
    <div id="priceCheckTotal" style="padding: 12px 16px; background: var(--ios-card); font-weight: 600; text-align: center;"></div>
    <div class="price-check-grid" id="priceCheckGrid"></div>
    <div id="priceCheckPagination" style="padding: 16px; display: flex; justify-content: center; gap: 12px;"></div>
  </div>`; 
}

async function loadPriceCheckNew() {
  // Загружаем общее количество и товары
  const [totalData, productsData, marksData] = await Promise.all([
    apiGet('/api/price-check/total-count'),
    apiGet(`/api/price-check/all-products?page=${priceCheckCurrentPage}`),
    apiGet('/api/price-check/all-marks')
  ]);
  
  // Сохраняем отметки
  priceCheckMarks = {};
  if (marksData) {
    marksData.forEach(m => {
      priceCheckMarks[m.product_id] = m.mark_type;
    });
  }
  
  // Обновляем общее количество
  const totalEl = document.getElementById('priceCheckTotal');
  if (totalEl && totalData) {
    totalEl.textContent = `Всего товаров: ${totalData.count}`;
  }
  
  // Обновляем пагинацию
  if (productsData) {
    priceCheckTotalPages = productsData.totalPages || 1;
    renderPriceCheckPagination();
  }
  
  // Отображаем товары
  renderPriceCheckGrid(productsData?.products || []);
}

function renderPriceCheckPagination() {
  const container = document.getElementById('priceCheckPagination');
  if (!container) return;
  
  let html = '';
  if (priceCheckCurrentPage > 1) {
    html += `<button class="btn btn-secondary" onclick="changePriceCheckPage(${priceCheckCurrentPage - 1})">‹ Назад</button>`;
  }
  html += `<span style="padding: 12px; font-weight: 600;">${priceCheckCurrentPage} / ${priceCheckTotalPages}</span>`;
  if (priceCheckCurrentPage < priceCheckTotalPages) {
    html += `<button class="btn btn-secondary" onclick="changePriceCheckPage(${priceCheckCurrentPage + 1})">Вперёд ›</button>`;
  }
  container.innerHTML = html;
}

function changePriceCheckPage(page) {
  priceCheckCurrentPage = page;
  loadPriceCheckNew();
}

function renderPriceCheckGrid(products) {
  const grid = document.getElementById('priceCheckGrid');
  if (!grid) return;
  
  if (products.length === 0) {
    grid.innerHTML = '<div class="empty-state">Нет товаров</div>';
    return;
  }
  
  grid.innerHTML = products.map(p => {
    const imgUrl = getImageUrl(p.picture);
    const hasMark = priceCheckMarks[p.id];
    
    return `<div class="price-check-card" onclick="openPriceCheckModal(${p.id}, '${p.name.replace(/'/g, "\\'")}', '${p.vendor_code || ''}', '${p.barcode || ''}')">
      <div class="price-check-image-wrapper">
        ${createCachedImage(imgUrl, 'price-check-image', p.name)}
        ${hasMark ? '<div class="price-check-mark">!</div>' : ''}
      </div>
      <div class="price-check-info">
        <div class="price-check-name">${p.name}</div>
        <div class="price-check-code">Арт: ${p.vendor_code || '-'}</div>
        <div class="price-check-barcode">ШК: ${p.barcode || '-'}</div>
      </div>
    </div>`;
  }).join('');
}

function openPriceCheckModal(productId, productName, vendorCode, barcode) {
  const existingMark = priceCheckMarks[productId];
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'priceCheckModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px;">
      <h3 style="margin-bottom: 16px; text-align: center;">${productName}</h3>
      <div style="margin-bottom: 16px; color: var(--ios-gray); text-align: center;">
        <div>Артикул: ${vendorCode || '-'}</div>
        <div>Штрих-код: ${barcode || '-'}</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label class="price-check-option ${existingMark === 'no_product' ? 'selected' : ''}">
          <input type="radio" name="markType" value="no_product" ${existingMark === 'no_product' ? 'checked' : ''}>
          <span>Нет такого товара</span>
        </label>
        <label class="price-check-option ${existingMark === 'no_price_tag' ? 'selected' : ''}">
          <input type="radio" name="markType" value="no_price_tag" ${existingMark === 'no_price_tag' ? 'checked' : ''}>
          <span>Нету ценника</span>
        </label>
        <label class="price-check-option ${existingMark === 'need_new_tag' ? 'selected' : ''}">
          <input type="radio" name="markType" value="need_new_tag" ${existingMark === 'need_new_tag' ? 'checked' : ''}>
          <span>Нужен новый ценник</span>
        </label>
        <label class="price-check-option ${existingMark === 'remove' ? 'selected' : ''}">
          <input type="radio" name="markType" value="remove" ${existingMark === 'remove' ? 'checked' : ''}>
          <span>Удалить отметку</span>
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closePriceCheckModal()">Отмена</button>
        <button class="btn btn-primary" onclick="savePriceCheckMark(${productId})">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function closePriceCheckModal() {
  const modal = document.getElementById('priceCheckModal');
  if (modal) modal.remove();
}

async function savePriceCheckMark(productId) {
  const selected = document.querySelector('input[name="markType"]:checked');
  if (!selected) {
    closePriceCheckModal();
    return;
  }
  
  const markType = selected.value;
  await apiPost('/api/price-check/mark-product', { productId, markType });
  
  // Обновляем локальные данные
  if (markType === 'remove') {
    delete priceCheckMarks[productId];
  } else {
    priceCheckMarks[productId] = markType;
  }
  
  closePriceCheckModal();
  loadPriceCheckNew(); // Перезагружаем для обновления значков
}

// Старые функции проверки ценников (оставляем для совместимости)
async function showPriceCheckPages(categoryId, categoryName) {
  currentCategoryId = categoryId; currentCategoryName = categoryName; currentView = 'price-check-pages'; renderApp();
  document.getElementById('pcCategoryTitle').textContent = categoryName;
  const data = await apiGet(`/api/price-check/pages/${categoryId}`);
  const grid = document.getElementById('pagesGrid');
  if (grid) {
    grid.innerHTML = data.pages.map(p => `<div class="page-item ${p.isLocked ? 'locked' : ''} ${p.lockedById === currentUser.id ? 'active' : ''}" onclick="${p.isLocked ? '' : `openPriceCheckPage(${p.pageNumber})`}"><div class="page-number">Стр. ${p.pageNumber}</div><div class="page-status">${p.lockedBy ? 'Занято: ' + p.lockedBy : 'Свободно'}</div></div>`).join('');
  }
}

function renderPriceCheckPages() { return `<div class="main-layout"><div class="header"><button class="back-btn" onclick="showPriceCheckCategories()">‹ Назад</button><div class="header-title" id="pcCategoryTitle">Категория</div><div></div></div><div class="pages-grid" id="pagesGrid"></div></div>`; }

async function showPriceCheckPages(categoryId, categoryName) {
  currentCategoryId = categoryId; currentCategoryName = categoryName; currentView = 'price-check-pages'; renderApp();
  document.getElementById('pcCategoryTitle').textContent = categoryName;
  const data = await apiGet(`/api/price-check/pages/${categoryId}`);
  const grid = document.getElementById('pagesGrid');
  if (grid) {
    grid.innerHTML = data.pages.map(p => `<div class="page-item ${p.isLocked ? 'locked' : ''} ${p.lockedById === currentUser.id ? 'active' : ''}" onclick="${p.isLocked ? '' : `openPriceCheckPage(${p.pageNumber})`}"><div class="page-number">Стр. ${p.pageNumber}</div><div class="page-status">${p.lockedBy ? 'Занято: ' + p.lockedBy : 'Свободно'}</div></div>`).join('');
  }
}

function renderPriceCheckPages() { return `<div class="main-layout"><div class="header"><button class="back-btn" onclick="showPriceCheckCategories()">‹ Назад</button><div class="header-title" id="pcCategoryTitle">Категория</div><div></div></div><div class="pages-grid" id="pagesGrid"></div></div>`; }

async function openPriceCheckPage(pageNumber) {
  await apiPost('/api/price-check/lock-page', { categoryId: currentCategoryId, pageNumber });
  currentPageNumber = pageNumber; currentView = 'price-check-products'; renderApp();
  document.getElementById('pcPageTitle').textContent = `${currentCategoryName} - Стр. ${pageNumber}`;
  const products = await apiGet(`/api/price-check/products/${currentCategoryId}/${pageNumber}`);
  const list = document.getElementById('pcProductsList');
  if (list) list.innerHTML = products.map(p => {
    const imgUrl = getImageUrl(p.picture);
    return `<div class="pc-product">${createCachedImage(imgUrl, 'pc-product-image', p.name)}<div class="pc-product-info"><div class="pc-product-name">${p.name}</div><div class="pc-product-code">${p.vendor_code || ''}</div><div class="pc-product-actions"><button class="pc-btn problem ${p.has_problem ? 'active' : ''}" onclick="toggleProblem(${p.id})">Проблема</button><button class="pc-btn price ${p.price_checked ? 'active' : ''}" onclick="togglePrice(${p.id})">Ценник</button></div></div></div>`;
  }).join('');
}

function renderPriceCheckProducts() { return `<div class="main-layout"><div class="header"><button class="back-btn" onclick="closePriceCheckPage()">‹ Назад</button><div class="header-title" id="pcPageTitle">Страница</div><div></div></div><div id="pcProductsList" style="padding: 16px; padding-bottom: 100px;"></div></div>`; }

async function closePriceCheckPage() { await apiPost('/api/price-check/unlock-page', { categoryId: currentCategoryId, pageNumber: currentPageNumber }); showPriceCheckPages(currentCategoryId, currentCategoryName); }
async function toggleProblem(productId) { await apiPost('/api/price-check/toggle-problem', { categoryId: currentCategoryId, pageNumber: currentPageNumber, productId }); openPriceCheckPage(currentPageNumber); }
async function togglePrice(productId) { await apiPost('/api/price-check/toggle-price', { categoryId: currentCategoryId, pageNumber: currentPageNumber, productId }); openPriceCheckPage(currentPageNumber); }

// Product Check
async function showProductCheck() { currentView = 'product-check'; renderApp(); const products = await apiGet('/api/product-check/missing-barcodes'); const list = document.getElementById('pcMissingList'); if (list) { if (products.length === 0) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div>Все товары имеют штрих-коды</div>'; } else { list.innerHTML = products.map(p => `<div class="assembly-item"><div class="assembly-content"><div style="font-weight: 500;">${p.name}</div><div class="product-code">${p.category_name} | ${p.vendor_code || ''}</div></div><button class="icon-btn" onclick="hideProduct(${p.id})">✕</button></div>`).join(''); } } }
function renderProductCheck() { return `<div class="main-layout"><div class="header"><button class="back-btn" onclick="showMainMenu()">‹ Назад</button><div class="header-title">Проверка товара</div><div></div></div><div id="pcMissingList" style="padding: 16px;"><div class="loading">Загрузка...</div></div></div>`; }
async function hideProduct(productId) { await apiPost('/api/product-check/hide', { productId }); showProductCheck(); }

// Calendar
function renderCalendar() {
  const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const today = new Date();
  const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - today.getDay() + 1);
  let html = `<div class="main-layout"><div class="header"><button class="back-btn" onclick="showMainMenu()">‹ Назад</button><div class="header-title">Календарь</div><div></div></div><div class="calendar-grid">`;
  for (let i = 0; i < 7; i++) { const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i); const isToday = d.toDateString() === today.getDate(); html += `<div class="calendar-day ${isToday ? 'active' : ''}"><span class="calendar-day-name">${days[i]}</span><span class="calendar-day-number">${d.getDate()}</span></div>`; }
  html += `</div><div class="calendar-events" id="calendarEvents"><div class="empty-state">Нет событий</div></div></div>`;
  return html;
}
function showCalendar() { currentView = 'calendar'; renderApp(); loadCalendarEvents(); }
async function loadCalendarEvents() {
  const today = new Date();
  const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - today.getDay() + 1);
  const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6);
  const items = await apiGet(`/api/calendar/items?startDate=${startOfWeek.toISOString().split('T')[0]}&endDate=${endOfWeek.toISOString().split('T')[0]}`);
  const container = document.getElementById('calendarEvents');
  if (container && items && items.length > 0) { container.innerHTML = items.map(item => `<div class="event-item"><div class="event-title">${item.title}</div><div class="event-text">${item.text || ''}</div></div>`).join(''); }
}

// Admin
async function showAdmin() { 
  adminActiveTab = 'overview';
  currentView = 'admin'; 
  renderApp(); 
  loadAdminOverview(); 
}
async function loadAdminOverview() {
  const data = await apiGet('/api/admin/overview');
  const container = document.getElementById('adminOverview');
  if (container && data) {
    const syncStatus = data.syncStatus || {};
    const statusColor = syncStatus.status === 'completed' ? 'var(--ios-green)' : (syncStatus.status === 'running' ? 'var(--ios-blue)' : 'var(--ios-orange)');
    container.innerHTML = `<div class="stat-row"><span class="stat-label">Сотрудники онлайн</span><span class="stat-value">${data.onlineUsers}</span></div>
    <div class="stat-row"><span class="stat-label">Товаров в каталоге</span><span class="stat-value">${data.totalProducts}</span></div>
    <div class="stat-row"><span class="stat-label">Без штрих-кода</span><span class="stat-value">${data.missingBarcodes}</span></div>
    <div class="stat-row"><span class="stat-label">Синхронизация</span><span class="stat-value" style="color: ${statusColor}">${syncStatus.status || 'idle'} ${syncStatus.progress ? syncStatus.progress + '%' : ''}</span></div>
    ${syncStatus.message ? `<div style="margin-top: 8px; font-size: 13px; color: var(--ios-gray);">${syncStatus.message}</div>` : ''}
    ${syncStatus.status === 'running' ? `<div class="sync-progress" style="margin-top: 8px;"><div class="sync-progress-bar" style="width: ${syncStatus.progress || 0}%"></div></div>` : ''}`;
  }
}

// Admin Tabs State
let adminActiveTab = 'overview';

function renderAdmin() {
  const isAdmin = currentUser?.role === 'admin';
  const tabsHtml = `
    <div class="admin-tabs">
      <div class="admin-tab ${adminActiveTab === 'overview' ? 'active' : ''}" onclick="switchAdminTab('overview')">Обзор</div>
      <div class="admin-tab ${adminActiveTab === 'users' ? 'active' : ''}" onclick="switchAdminTab('users')">Пользователи</div>
      <div class="admin-tab ${adminActiveTab === 'locks' ? 'active' : ''}" onclick="switchAdminTab('locks')">Блокировки</div>
    </div>
  `;
  
  let contentHtml = '';
  if (adminActiveTab === 'overview') {
    contentHtml = `
      <div class="admin-card"><div class="admin-card-title">Обзор системы</div><div id="adminOverview"><div class="loading">Загрузка...</div></div></div>
      <div class="admin-card"><div class="admin-card-title">Синхронизация</div>
        <button class="btn btn-primary" onclick="startSync()" style="margin-bottom: 8px; width: 100%;">🔄 Обновить каталог</button>
        <button class="btn btn-secondary" onclick="resetSync()" style="width: 100%;">Сбросить обновление</button>
      </div>
      ${isAdmin ? `
      <div class="admin-card"><div class="admin-card-title">Сборка</div>
        <button class="btn btn-danger" onclick="clearAllAssembly()" style="width: 100%;">🗑️ Очистить все заявки</button>
      </div>` : ''}
    `;
  } else if (adminActiveTab === 'users') {
    contentHtml = `<div class="admin-card"><div class="admin-card-title">Управление пользователями</div><div id="adminUsers"><div class="loading">Загрузка...</div></div></div>`;
  } else if (adminActiveTab === 'locks') {
    contentHtml = `<div class="admin-card"><div class="admin-card-title">Блокировки страниц</div><div id="adminLocks"><div class="loading">Загрузка...</div></div></div>`;
  }
  
  return `<div class="main-layout"><div class="header"><button class="back-btn" onclick="showMainMenu()">‹ Назад</button><div class="header-title">Админка</div><div></div></div>
    ${tabsHtml}
    <div class="admin-sections">${contentHtml}</div>
  </div>`;
}

function switchAdminTab(tab) {
  adminActiveTab = tab;
  renderApp();
  if (tab === 'overview') loadAdminOverview();
  if (tab === 'users') loadAdminUsers();
  if (tab === 'locks') loadAdminLocks();
}

// Load Users List
async function loadAdminUsers() {
  const users = await apiGet('/api/admin/users');
  const container = document.getElementById('adminUsers');
  if (!container) return;
  
  if (!users || users.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет пользователей</div>';
    return;
  }
  
  container.innerHTML = `
    <button class="btn btn-primary" onclick="showAddUserForm()" style="margin-bottom: 16px; width: 100%;">➕ Добавить пользователя</button>
    <div id="userFormContainer"></div>
    <div class="users-list">
      ${users.map(u => `
        <div class="user-item" id="user-${u.id}">
          <div class="user-info">
            <div class="user-login">${u.login}</div>
            <div class="user-meta">
              <span class="user-role ${u.role}">${u.role === 'admin' ? '👑 Админ' : '👤 Сотрудник'}</span>
              <span class="user-status ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? '✓ Активен' : '✗ Отключен'}</span>
            </div>
            <div class="user-dates">
              <small>Создан: ${new Date(u.created_at).toLocaleDateString('ru-RU')}</small>
              ${u.last_login_at ? `<small> | Посл. вход: ${new Date(u.last_login_at).toLocaleString('ru-RU')}</small>` : ''}
            </div>
          </div>
          <div class="user-actions">
            <button class="icon-btn" onclick="editUser(${u.id}, '${u.login}', '${u.role}', ${u.is_active})" title="Редактировать">✏️</button>
            ${u.id !== currentUser.id ? `<button class="icon-btn" onclick="deleteUser(${u.id})" title="Удалить">🗑️</button>` : ''}
          </div>
        </div>
        <div class="user-edit-form" id="edit-form-${u.id}" style="display:none;"></div>
      `).join('')}
    </div>
  `;
}

// Show Add User Form
function showAddUserForm() {
  const container = document.getElementById('userFormContainer');
  container.innerHTML = `
    <div class="user-form">
      <h4>Новый пользователь</h4>
      <input type="text" id="newUserLogin" class="form-input" placeholder="Логин" required>
      <input type="password" id="newUserPassword" class="form-input" placeholder="Пароль" required>
      <select id="newUserRole" class="form-input">
        <option value="staff">👤 Сотрудник</option>
        <option value="admin">👑 Администратор</option>
      </select>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="document.getElementById('userFormContainer').innerHTML=''">Отмена</button>
        <button class="btn btn-primary" onclick="addUser()">Создать</button>
      </div>
    </div>
  `;
}

// Add User
async function addUser() {
  const login = document.getElementById('newUserLogin').value.trim();
  const password = document.getElementById('newUserPassword').value;
  const role = document.getElementById('newUserRole').value;
  
  if (!login || !password) {
    alert('Введите логин и пароль');
    return;
  }
  
  const result = await apiPost('/api/admin/users', { login, password, role });
  if (result.error) {
    alert('Ошибка: ' + result.error);
  } else {
    alert('Пользователь создан');
    loadAdminUsers();
  }
}

// Edit User Form
function editUser(id, login, role, isActive) {
  document.querySelectorAll('.user-edit-form').forEach(el => el.style.display = 'none');
  
  const formContainer = document.getElementById(`edit-form-${id}`);
  formContainer.innerHTML = `
    <div class="user-form">
      <h4>Редактировать: ${login}</h4>
      <input type="text" id="editLogin-${id}" class="form-input" value="${login}" placeholder="Логин">
      <input type="password" id="editPassword-${id}" class="form-input" placeholder="Новый пароль (оставьте пустым чтобы не менять)">
      <select id="editRole-${id}" class="form-input">
        <option value="staff" ${role === 'staff' ? 'selected' : ''}>👤 Сотрудник</option>
        <option value="admin" ${role === 'admin' ? 'selected' : ''}>👑 Администратор</option>
      </select>
      <label class="checkbox-label">
        <input type="checkbox" id="editActive-${id}" ${isActive ? 'checked' : ''}>
        Активен
      </label>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="document.getElementById('edit-form-${id}').style.display='none'">Отмена</button>
        <button class="btn btn-primary" onclick="saveUser(${id})">Сохранить</button>
      </div>
    </div>
  `;
  formContainer.style.display = 'block';
}

// Save User
async function saveUser(id) {
  const login = document.getElementById(`editLogin-${id}`).value.trim();
  const password = document.getElementById(`editPassword-${id}`).value;
  const role = document.getElementById(`editRole-${id}`).value;
  const isActive = document.getElementById(`editActive-${id}`).checked;
  
  if (!login) {
    alert('Введите логин');
    return;
  }
  
  const data = { login, role, is_active: isActive };
  if (password) data.password = password;
  
  const result = await apiPost(`/api/admin/users/${id}`, data);
  if (result.error) {
    alert('Ошибка: ' + result.error);
  } else {
    alert('Сохранено');
    loadAdminUsers();
  }
}

// Delete User
async function deleteUser(id) {
  if (!confirm('Удалить пользователя?')) return;
  
  try {
    const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (res.ok) {
      alert('Пользователь удален');
      loadAdminUsers();
    } else {
      const data = await res.json();
      alert('Ошибка: ' + (data.error || 'Не удалось удалить'));
    }
  } catch (e) {
    alert('Ошибка удаления');
  }
}

// Load Locks
async function loadAdminLocks() {
  const locks = await apiGet('/api/admin/locks');
  const container = document.getElementById('adminLocks');
  if (!container) return;
  
  if (!locks || locks.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет активных блокировок</div>';
    return;
  }
  
  container.innerHTML = `
    <div class="locks-list">
      ${locks.map(l => `
        <div class="lock-item">
          <div class="lock-info">
            <div class="lock-category">${l.category_name}</div>
            <div class="lock-meta">Страница ${l.page_number} | Заблокировано: ${l.locked_by_name}</div>
            <div class="lock-time"><small>${new Date(l.locked_at).toLocaleString('ru-RU')}</small></div>
          </div>
          <button class="btn btn-secondary" onclick="forceUnlock(${l.category_id}, ${l.page_number})">Разблокировать</button>
        </div>
      `).join('')}
    </div>
  `;
}

// Force Unlock
async function forceUnlock(categoryId, pageNumber) {
  const result = await apiPost('/api/admin/force-unlock', { categoryId, pageNumber });
  if (result.success) {
    alert('Разблокировано');
    loadAdminLocks();
  } else {
    alert('Ошибка');
  }
}

async function startSync() { 
  await apiPost('/api/sync/start', {}); 
  alert('Синхронизация запущена'); 
  const interval = setInterval(async () => {
    await loadAdminOverview();
    const data = await apiGet('/api/admin/overview');
    if (data?.syncStatus?.status === 'completed' || data?.syncStatus?.status === 'error') {
      clearInterval(interval);
    }
  }, 3000);
}

async function resetSync() { await apiPost('/api/sync/reset', {}); alert('Синхронизация сброшена'); loadAdminOverview(); }

// Очистить все заявки (только для админа)
async function clearAllAssembly() {
  if (!confirm('Очистить ВСЕ заявки на сборку? Это действие нельзя отменить.')) return;
  
  const result = await apiPost('/api/carry/clear-all', {});
  if (result.success) {
    alert('Все заявки очищены');
    collectedIds.clear();
    showMainMenu();
  } else {
    alert('Ошибка: ' + (result.error || 'Не удалось очистить'));
  }
}

// Init on load
document.addEventListener('DOMContentLoaded', init);
