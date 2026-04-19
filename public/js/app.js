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

// Состояние смены
let shiftStatus = 'not_started'; // not_started, started, late, no_show
let shiftTime = null;

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

function tapFeedback(strong = false) {
  try { if (navigator.vibrate) navigator.vibrate(strong ? 30 : 12); } catch (e) {}
}

document.addEventListener('click', (e) => {
  const target = e.target.closest('button, .menu-item, .category-item, .product-card, .assembly-item, .price-check-card, .calendar-day, .admin-tab');
  if (target) tapFeedback(false);
}, true);

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
    case 'price-check-print': app.innerHTML = renderPriceCheckPrint(); break;
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
  return `<div class="login-screen apple-auth-screen">
    <div class="login-shell">
      <div class="login-brand-mark">◈</div>
      <div class="login-logo">ZAN</div>
      <div class="login-subtitle">Склад и контроль операций</div>
      <div class="login-glass-card">
        <div class="section-kicker">Вход в систему</div>
        <form class="login-form" onsubmit="handleLogin(event)">
          <input type="text" class="login-input" id="login" placeholder="Логин" required autocomplete="username">
          <input type="password" class="login-input" id="password" placeholder="Пароль" required autocomplete="current-password">
          <button type="submit" class="login-btn">Продолжить</button>
        </form>
      </div>
    </div>
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
  
  // Определяем цвет кнопки смены
  let shiftBtnClass = 'btn-primary';
  let shiftBtnText = '🕐 Начало смены';
  if (shiftStatus === 'on_time') {
    shiftBtnClass = 'btn-success';
    shiftBtnText = '✓ Смена начата';
  } else if (shiftStatus === 'late') {
    shiftBtnClass = 'btn-warning';
    shiftBtnText = '⚠ Опоздание';
  } else if (shiftStatus === 'no_show') {
    shiftBtnClass = 'btn-danger';
    shiftBtnText = '✗ Не выход';
  }
  
  return `<div class="main-layout app-shell">
    <div class="header header-large">
      <div>
        <div class="header-eyebrow">Рабочее пространство</div>
        <div class="header-title">ZAN</div>
      </div>
      <div class="header-user glass-inline">
        <span id="shiftIndicator" style="margin-right: 8px; font-size: 13px;"></span>
        <span class="header-user-name">${currentUser.login}</span>
        <button class="logout-btn" onclick="handleLogout()">Выйти</button>
      </div>
    </div>
    <div class="hero-card compact-hero">
      <div>
        <div class="hero-title">Склад под рукой</div>
        <div class="hero-subtitle">Быстрые действия, чистый интерфейс, акцент на работу пальцем.</div>
      </div>
      <div class="hero-meta">
        <span id="lastSyncDate" class="sync-chip">Загрузка...</span>
      </div>
    </div>
    <div style="padding: 0 16px 12px;">
      <button class="btn ${shiftBtnClass}" onclick="startShift()" style="width: 100%;" ${shiftStatus !== 'not_started' && shiftStatus !== 'no_show' ? 'disabled' : ''}>
        ${shiftBtnText}
      </button>
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

function showMainMenu() { currentView = 'menu'; renderApp(); checkShiftStatus(); loadLastSyncDate(); checkInstallPrompt(); }

async function loadLastSyncDate() {
  const data = await apiGet('/api/sync/status');
  const el = document.getElementById('lastSyncDate');
  if (el && data && data.last_sync_at) {
    const d = new Date(data.last_sync_at);
    el.textContent = `Каталог обновлён: ${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (el) {
    el.textContent = 'Каталог не синхронизирован';
  }
}

// Проверить статус смены
async function checkShiftStatus() {
  const data = await apiGet('/api/shift/my-today');
  if (data) {
    shiftStatus = data.status;
    shiftTime = data.start_time_yakutsk;
    updateShiftIndicator();
  }
}

// Обновить индикатор смены
function updateShiftIndicator() {
  const indicator = document.getElementById('shiftIndicator');
  if (!indicator) return;
  
  if (shiftStatus === 'started' || shiftStatus === 'on_time') {
    indicator.innerHTML = `<span style="color: var(--ios-green);">✓ Смена начата ${shiftTime}</span>`;
  } else if (shiftStatus === 'late') {
    indicator.innerHTML = `<span style="color: var(--ios-orange);">⚠ Опоздание ${shiftTime}</span>`;
  } else if (shiftStatus === 'no_show') {
    indicator.innerHTML = `<span style="color: var(--ios-red);">✗ Не выход</span>`;
  } else {
    indicator.innerHTML = '';
  }
}

// Начать смену
async function startShift() {
  const result = await apiPost('/api/shift/start', {});
  if (result.success) {
    shiftStatus = result.status;
    shiftTime = result.startTime;
    updateShiftIndicator();
    alert(`Смена начата! ${result.statusText} (${result.startTime})`);
  } else {
    alert(result.error || 'Ошибка');
  }
}
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
  return `<div class="main-layout app-shell">
    <div class="header">
      <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
      <div class="header-title">Заявка на занос</div>
      <div></div>
    </div>
    <div class="hero-card page-hero">
      <div>
        <div class="hero-title">Категории</div>
        <div class="hero-subtitle">Открывай раздел и сразу добавляй позиции. Сборка остаётся общей.</div>
      </div>
    </div>
    <div class="categories-list" id="categoriesList"><div class="loading">Загрузка...</div></div>
    <div style="height: 92px;"></div>
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
  return `<div class="main-layout app-shell products-screen">
    <div class="header">
      <button class="back-btn" onclick="showCarryCategories()">‹ Назад</button>
      <div class="header-title" id="categoryTitle">Категория</div>
      <div class="header-actions-dot"></div>
    </div>
    <div id="categoryStats"></div>
    <div class="products-grid" id="productsGrid"></div>
    <div style="height: 92px;"></div>
    <div class="bottom-actions">
      <button class="btn btn-secondary" onclick="printCategory()">🖨️ Печать</button>
      <button class="btn btn-primary" onclick="confirmCategory()">✓ Готово</button>
    </div>
  </div>`;
}


// Calculate stock remaining in boxes
function calculateStockBoxes(stockQuantity, boxCount, blockCount) {
  if (!stockQuantity || !boxCount || !blockCount) return null;
  return (stockQuantity / boxCount / blockCount).toFixed(2);
}

// Get stock status display text and class
function getStockStatus(stockQuantity, boxCount, blockCount) {
  const boxes = calculateStockBoxes(stockQuantity, boxCount, blockCount);
  if (boxes === null) return { text: '', class: '', boxes: 0 };
  if (boxes < 1) return { text: 'Последний', class: 'stock-last', boxes: boxes };
  return { text: boxes, class: 'stock-normal', boxes: boxes };
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

      // Обновляем бейдж остатка на складе
      const stockStatus = getStockStatus(p.stock_quantity, p.box_count, p.block_count);
      let stockEl = card.querySelector('.stock-badge');
      if (stockStatus.text) {
        if (stockEl) {
          stockEl.textContent = stockStatus.text;
          stockEl.className = `stock-badge ${stockStatus.class}`;
        } else {
          const newStockEl = document.createElement('div');
          newStockEl.className = `stock-badge ${stockStatus.class}`;
          newStockEl.textContent = stockStatus.text;
          card.appendChild(newStockEl);
        }
      } else if (stockEl) {
        stockEl.remove();
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
    
    const stockStatus = getStockStatus(p.stock_quantity, p.box_count, p.block_count);

    return `<div class="product-card ${stockStatus.class}" onclick="addToCarry(${p.id}, ${step})" data-product-id="${p.id}">
      ${createCachedImage(imgUrl, 'product-image', p.name)}
      ${qty > 0 ? `<div class="product-qty-left" onclick="event.stopPropagation(); removeFromCarry(${p.id}, ${step})">${qty}</div>` : ''}
      ${clickData ? `<div class="product-click-indicator" style="background-color: ${clickData.color}" title="Нажал: ${clickData.login}"></div>` : ''}
      ${stockStatus.text ? `<div class="stock-badge ${stockStatus.class}">${stockStatus.text}</div>` : ''}
      <div class="product-info"><div class="product-name">${p.name}</div></div>
    </div>`;
  }).join('');
}

async function addToCarry(productId, step) {
  // Find product data to check stock
  const product = currentProducts.find(p => p.id === productId);
  const stockStatus = product ? getStockStatus(product.stock_quantity, product.box_count, product.block_count) : null;

  // If stock is less than 1 box, show confirmation dialog
  if (stockStatus && stockStatus.boxes < 1) {
    const confirmed = confirm('Последний остаток на складе! \n\nВы уверены, что хотите добавить этот товар?');
    if (!confirmed) return;
  }

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
  return `<div class="main-layout app-shell">
    <div class="header">
      <button class="back-btn" onclick="showCarryCategories()">‹ Назад</button>
      <div class="header-title">Сборка</div>
      <button class="btn btn-secondary btn-small" onclick="printAssembly()">🖨️ Печать</button>
    </div>
    <div class="hero-card page-hero small-hero">
      <div>
        <div class="hero-title">Общая заявка</div>
        <div class="hero-subtitle">Отмечай собранные позиции и держи темп без лишних переходов.</div>
      </div>
    </div>
    <div id="assemblyStats"></div>
    <div id="assemblyList"></div>
    <div style="height: 92px;"></div>
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
  return `<div class="main-layout app-shell">
    <div class="header">
      <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
      <div class="header-title">Проверка ценников</div>
      <button class="btn btn-secondary btn-small" onclick="printPriceCheck()">🖨️ Печать</button>
    </div>
    <div class="hero-card page-hero small-hero split-hero">
      <div>
        <div class="hero-title">Быстрая ревизия</div>
        <div class="hero-subtitle">Тап по карточке — отметь проблему, срок или отсутствие товара.</div>
      </div>
      <div id="priceCheckTotal" class="hero-pill"></div>
    </div>
    <div class="price-check-grid" id="priceCheckGrid"></div>
    <div id="priceCheckPagination" class="pagination-wrap"></div>
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
  const maxVisible = 5; // Показываем максимум 5 номеров
  
  // Определяем диапазон страниц для показа
  let startPage = Math.max(1, priceCheckCurrentPage - 2);
  let endPage = Math.min(priceCheckTotalPages, startPage + maxVisible - 1);
  
  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }
  
  // Кнопка "Назад"
  if (priceCheckCurrentPage > 1) {
    html += `<button class="page-btn" onclick="changePriceCheckPage(${priceCheckCurrentPage - 1})">‹</button>`;
  }
  
  // Номера страниц
  for (let i = startPage; i <= endPage; i++) {
    if (i === priceCheckCurrentPage) {
      html += `<button class="page-btn active">${i}</button>`;
    } else {
      html += `<button class="page-btn" onclick="changePriceCheckPage(${i})">${i}</button>`;
    }
  }
  
  // Кнопка "Далее" если есть ещё страницы
  if (endPage < priceCheckTotalPages) {
    html += `<span style="padding: 8px; color: var(--ios-gray);">...</span>`;
    html += `<button class="page-btn" onclick="changePriceCheckPage(${endPage + 1})">Далее</button>`;
  }
  
  // Кнопка "Вперёд"
  if (priceCheckCurrentPage < priceCheckTotalPages) {
    html += `<button class="page-btn" onclick="changePriceCheckPage(${priceCheckCurrentPage + 1})">›</button>`;
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
    const trafficLight = getExpiryTrafficLight(p.expiry_date);
    const expiryFormatted = formatExpiryDate(p.expiry_date);
    
    return `<div class="price-check-card" onclick="openPriceCheckModal(${p.id}, '${p.name.replace(/'/g, "\\'")}', '${p.vendor_code || ''}', '${p.expiry_date || ''}')">
      <div class="price-check-image-wrapper">
        ${createCachedImage(imgUrl, 'price-check-image', p.name)}
        ${hasMark ? '<div class="price-check-mark">!</div>' : ''}
      </div>
      <div class="price-check-info">
        <div class="price-check-name">${p.name}</div>
        <div class="price-check-code">${p.vendor_code || ''}</div>
        ${expiryFormatted ? `<div class="price-check-expiry" style="color: ${trafficLight}; font-weight: 600;">${expiryFormatted}</div>` : '<div class="price-check-expiry" style="color: var(--ios-gray3);">—</div>'}
      </div>
    </div>`;
  }).join('');
}

// Функция для определения цвета светофора по сроку годности
function getExpiryTrafficLight(expiryDate) {
  if (!expiryDate) return null;
  
  // Парсим ISO формат ГГГГ-ММ-ДД
  const parts = expiryDate.split('-');
  if (parts.length !== 3) return null;
  
  const expiry = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const now = new Date();
  const diffTime = expiry - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays > 90) return '#34C759'; // Зелёный
  if (diffDays >= 60) return '#FF9500'; // Жёлтый
  return '#FF3B30'; // Красный
}

// Форматирование даты срока годности из ISO в ДД.ММ.ГГ
function formatExpiryDate(expiryDate) {
  if (!expiryDate) return '';
  
  // Парсим ISO формат ГГГГ-ММ-ДД
  const parts = expiryDate.split('-');
  if (parts.length !== 3) return '';
  
  const day = parts[2].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[0].slice(-2);
  
  return `${day}.${month}.${year}`;
}

function openPriceCheckModal(productId, productName, vendorCode, expiryDate) {
  const existingMark = priceCheckMarks[productId];
  const expiryFormatted = formatExpiryDate(expiryDate);
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'priceCheckModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px;">
      <h3 style="margin-bottom: 16px; text-align: center; font-size: 16px; line-height: 1.3; max-height: 65px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">${productName}</h3>
      <div style="margin-bottom: 16px; color: var(--ios-gray); text-align: center;">
        <div style="font-weight: 700; color: var(--ios-text); font-size: 18px;">${vendorCode || '-'}</div>
        ${expiryFormatted ? `<div style="margin-top: 4px;">Срок годности: ${expiryFormatted}</div>` : ''}
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label class="price-check-option ${existingMark === 'no_product' ? 'selected' : ''}">
          <input type="radio" name="markType" value="no_product" ${existingMark === 'no_product' ? 'checked' : ''} onchange="toggleExpiryInput(false)">
          <span>Нет такого товара</span>
        </label>
        <label class="price-check-option ${existingMark === 'no_price_tag' ? 'selected' : ''}">
          <input type="radio" name="markType" value="no_price_tag" ${existingMark === 'no_price_tag' ? 'checked' : ''} onchange="toggleExpiryInput(false)">
          <span>Нету ценника</span>
        </label>
        <label class="price-check-option ${existingMark === 'fix_expiry' ? 'selected' : ''}">
          <input type="radio" name="markType" value="fix_expiry" ${existingMark === 'fix_expiry' ? 'checked' : ''} onchange="toggleExpiryInput(true)">
          <span>Исправить срок годности</span>
        </label>
        <div id="expiryInputContainer" style="display: none; padding-left: 32px;">
          <input type="date" id="newExpiryDate" class="form-input" style="margin-bottom: 8px;" value="${expiryDate || ''}">
        </div>
        <label class="price-check-option ${existingMark === 'remove' ? 'selected' : ''}">
          <input type="radio" name="markType" value="remove" ${existingMark === 'remove' ? 'checked' : ''} onchange="toggleExpiryInput(false)">
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
  
  // Если уже выбран fix_expiry, показываем поле
  if (existingMark === 'fix_expiry') {
    toggleExpiryInput(true);
  }
}

function toggleExpiryInput(show) {
  const container = document.getElementById('expiryInputContainer');
  if (container) {
    container.style.display = show ? 'block' : 'none';
  }
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
  const newExpiryInput = document.getElementById('newExpiryDate');
  const newExpiry = (markType === 'fix_expiry' && newExpiryInput) ? newExpiryInput.value : null;
  
  await apiPost('/api/price-check/mark-product', { productId, markType, newExpiry });
  
  // Обновляем локальные данные
  if (markType === 'remove') {
    delete priceCheckMarks[productId];
  } else {
    priceCheckMarks[productId] = markType;
  }
  
  closePriceCheckModal();
  loadPriceCheckNew(); // Перезагружаем для обновления значков
}

// Печать проверки ценников
async function printPriceCheck() {
  const data = await apiGet('/api/price-check/print-check');
  if (!data || !data.items || data.items.length === 0) {
    alert('Нет отмеченных товаров для печати');
    return;
  }
  
  window.printData = {
    date: data.date,
    items: data.items.map(item => ({
      vendor_code: item.vendor_code,
      name: item.name,
      expiry_date: formatExpiryDate(item.expiry_date),
      new_expiry: item.new_expiry ? formatExpiryDate(item.new_expiry) : '',
      no_product: item.mark_type === 'no_product' ? '✓' : '',
      no_price_tag: item.mark_type === 'no_price_tag' ? '✓' : '',
      fix_expiry: item.mark_type === 'fix_expiry' ? '✓' : '',
      remove_mark: item.mark_type === 'remove' ? '✓' : ''
    }))
  };
  
  currentView = 'price-check-print'; 
  renderApp();
}

function renderPriceCheckPrint() {
  const data = window.printData || { date: '', items: [] };
  return `<div class="main-layout">
    <div class="header">
      <button class="back-btn" onclick="showPriceCheckCategories()">‹ Назад</button>
      <div class="header-title">Печать проверки ценников</div>
      <button class="btn btn-primary" onclick="window.print()" style="padding: 8px 16px; font-size: 14px;">🖨️ Печать</button>
    </div>
    <div class="print-content" style="padding: 20px; background: white; color: black;">
      <h2 style="margin-bottom: 5px;">Проверка ценников</h2>
      <p style="color: #666; margin-bottom: 20px;">${data.date}</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="border-bottom: 2px solid #333;">
            <th style="text-align: left; padding: 6px; font-size: 11px;">Артикул</th>
            <th style="text-align: left; padding: 6px; font-size: 11px;">Наименование</th>
            <th style="text-align: center; padding: 6px; font-size: 10px;">Нет такого<br>товара</th>
            <th style="text-align: center; padding: 6px; font-size: 10px;">Нету<br>ценника</th>
            <th style="text-align: center; padding: 6px; font-size: 10px;">Исправить<br>срок</th>
            <th style="text-align: center; padding: 6px; font-size: 10px;">Новый<br>срок</th>
            <th style="text-align: center; padding: 6px; font-size: 10px;">Удалить</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map((item, i) => `<tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 6px; font-weight: bold;">${item.vendor_code || '-'}</td>
            <td style="padding: 6px; font-weight: bold; line-height: 1.3;">${item.name}</td>
            <td style="padding: 6px; text-align: center; color: ${item.no_product ? 'var(--ios-red)' : '#ccc'}; font-weight: bold;">${item.no_product || '○'}</td>
            <td style="padding: 6px; text-align: center; color: ${item.no_price_tag ? 'var(--ios-red)' : '#ccc'}; font-weight: bold;">${item.no_price_tag || '○'}</td>
            <td style="padding: 6px; text-align: center; color: ${item.fix_expiry ? 'var(--ios-red)' : '#ccc'}; font-weight: bold;">${item.fix_expiry || '○'}</td>
            <td style="padding: 6px; text-align: center; color: ${item.new_expiry ? 'var(--ios-blue)' : '#ccc'}; font-weight: bold;">${item.new_expiry || '—'}</td>
            <td style="padding: 6px; text-align: center; color: ${item.remove_mark ? 'var(--ios-red)' : '#ccc'}; font-weight: bold;">${item.remove_mark || '○'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
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
function renderProductCheck() { return `<div class="main-layout app-shell"><div class="header"><button class="back-btn" onclick="showMainMenu()">‹ Назад</button><div class="header-title">Проверка товара</div><div></div></div><div class="hero-card page-hero small-hero"><div><div class="hero-title">Контроль карточек</div><div class="hero-subtitle">Проверь отсутствующие штрихкоды и проблемные товары без визуального шума.</div></div></div><div id="pcMissingList" style="padding: 16px;"><div class="loading">Загрузка...</div></div></div>`; }
async function hideProduct(productId) { await apiPost('/api/product-check/hide', { productId }); showProductCheck(); }

// Calendar - 4 недели с to-do задачами
let calendarWeekOffset = 0;
let calendarTodos = {}; // { date: [todos] }
let calendarNotes = {}; // { date: [notes] }

function renderCalendar() {
  const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const today = new Date();
  const currentWeekStart = new Date(today); 
  currentWeekStart.setDate(today.getDate() - today.getDay() + 1 + (calendarWeekOffset * 7));
  
  let html = `<div class="main-layout app-shell">
    <div class="header">
      <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
      <div class="header-title">Календарь</div>
      <div></div>
    </div>
    <div class="calendar-toolbar glass-card-inline">
      <button class="btn btn-secondary btn-small" onclick="changeCalendarWeek(-1)">‹ Неделя</button>
      <span class="calendar-week-chip">${calendarWeekOffset === 0 ? 'Текущая' : calendarWeekOffset > 0 ? '+' + calendarWeekOffset : calendarWeekOffset} неделя</span>
      <button class="btn btn-secondary btn-small" onclick="changeCalendarWeek(1)">Неделя ›</button>
    </div>`;
  
  // 4 недели
  for (let week = 0; week < 4; week++) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() + (week * 7));
    
    html += `<div class="calendar-week-label" style="padding: 8px 16px 4px; font-size: 12px; color: var(--ios-gray); font-weight: 600;">${week === 0 ? 'Текущая' : '+' + week} неделя</div>`;
    html += `<div class="calendar-grid">`;
    
    for (let i = 0; i < 7; i++) { 
      const d = new Date(weekStart); 
      d.setDate(weekStart.getDate() + i); 
      const isToday = d.toDateString() === today.toDateString();
      const dateStr = d.toISOString().split('T')[0];
      const hasNotes = calendarNotes[dateStr]?.length > 0;
      const hasTodos = calendarTodos[dateStr]?.length > 0;
      const hasEvents = hasNotes || hasTodos;
      
      html += `<div class="calendar-day ${isToday ? 'active' : ''} ${hasEvents ? 'has-events' : ''}" onclick="showDayDetails('${dateStr}')">
        <span class="calendar-day-name">${days[i]}</span>
        <span class="calendar-day-number">${d.getDate()}</span>
        ${hasTodos ? '<span class="calendar-todo-dot"></span>' : ''}
      </div>`; 
    }
    html += `</div>`;
  }
  
  html += `<div class="calendar-events" id="calendarEvents"><div class="empty-state">Выберите дату</div></div>`;
  html += `</div>`;
  return html;
}

function changeCalendarWeek(direction) {
  calendarWeekOffset += direction;
  showCalendar();
}

async function showCalendar() { 
  currentView = 'calendar'; 
  renderApp(); 
  await loadCalendarData();
}

async function loadCalendarData() {
  const today = new Date();
  const currentWeekStart = new Date(today); 
  currentWeekStart.setDate(today.getDate() - today.getDay() + 1 + (calendarWeekOffset * 7));
  const startDate = currentWeekStart.toISOString().split('T')[0];
  
  const endDateObj = new Date(currentWeekStart);
  endDateObj.setDate(currentWeekStart.getDate() + (4 * 7) - 1);
  const endDate = endDateObj.toISOString().split('T')[0];
  
  // Загружаем заметки и to-do
  const [notes, todos] = await Promise.all([
    apiGet(`/api/calendar/items?startDate=${startDate}&endDate=${endDate}`),
    apiGet(`/api/calendar/todos-range?startDate=${startDate}&endDate=${endDate}`)
  ]);
  
  // Сохраняем данные
  calendarNotes = {};
  if (notes) {
    notes.forEach(n => {
      if (!calendarNotes[n.date]) calendarNotes[n.date] = [];
      calendarNotes[n.date].push(n);
    });
  }
  
  calendarTodos = {};
  if (todos) {
    todos.forEach(t => {
      if (!calendarTodos[t.date]) calendarTodos[t.date] = [];
      calendarTodos[t.date].push(t);
    });
  }
  
  // Перерисовываем календарь с данными
  renderApp();
}

async function showDayDetails(dateStr) {
  const container = document.getElementById('calendarEvents');
  if (!container) return;
  
  const notes = calendarNotes[dateStr] || [];
  const todos = calendarTodos[dateStr] || [];
  
  const d = new Date(dateStr);
  const dateFormatted = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' });
  
  let html = `<div style="padding: 16px;">
    <h3 style="margin-bottom: 12px; font-size: 18px;">${dateFormatted}</h3>`;
  
  // Заметки
  if (notes.length > 0) {
    html += `<div style="margin-bottom: 16px;">
      <h4 style="font-size: 14px; color: var(--ios-gray); margin-bottom: 8px;">📝 Заметки</h4>`;
    notes.forEach(n => {
      html += `<div class="event-item"><div class="event-title">${n.title}</div><div class="event-text">${n.text || ''}</div></div>`;
    });
    html += `</div>`;
  }
  
  // To-do задачи
  if (todos.length > 0) {
    html += `<div>
      <h4 style="font-size: 14px; color: var(--ios-gray); margin-bottom: 8px;">✓ Задачи</h4>`;
    todos.forEach(t => {
      const isCompleted = t.is_completed;
      const completedBy = t.completed_by_name ? ` (${t.completed_by_name})` : '';
      html += `<div class="todo-item ${isCompleted ? 'completed' : ''}" onclick="toggleTodo(${t.id})" style="cursor: pointer;">
        <div class="todo-checkbox ${isCompleted ? 'checked' : ''}"></div>
        <div class="todo-content">
          <div style="${isCompleted ? 'text-decoration: line-through; color: var(--ios-gray);' : ''}">${t.title}</div>
          ${t.description ? `<div style="font-size: 13px; color: var(--ios-gray);">${t.description}</div>` : ''}
          ${isCompleted ? `<div style="font-size: 11px; color: var(--ios-green);">Выполнил${completedBy}</div>` : ''}
        </div>
      </div>`;
    });
    html += `</div>`;
  }
  
  if (notes.length === 0 && todos.length === 0) {
    html += `<div class="empty-state">Нет записей на эту дату</div>`;
  }
  
  html += `</div>`;
  container.innerHTML = html;
}

async function toggleTodo(todoId) {
  await apiPost(`/api/calendar/todos/${todoId}/toggle`, {});
  // Перезагружаем данные
  await loadCalendarData();
  // Обновляем отображение текущего дня
  const activeDate = document.querySelector('.calendar-day.active');
  if (activeDate) {
    // Находим дату из onclick атрибута
    const onclickAttr = activeDate.getAttribute('onclick');
    const dateMatch = onclickAttr?.match(/'(\d{4}-\d{2}-\d{2})'/);
    if (dateMatch) {
      showDayDetails(dateMatch[1]);
    }
  }
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
      <div class="admin-tab ${adminActiveTab === 'shifts' ? 'active' : ''}" onclick="switchAdminTab('shifts')">Смены</div>
      ${isAdmin ? `<div class="admin-tab ${adminActiveTab === 'calendar' ? 'active' : ''}" onclick="switchAdminTab('calendar')">Календарь</div>` : ''}
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
  } else if (adminActiveTab === 'shifts') {
    contentHtml = `
      <div class="admin-card">
        <div class="admin-card-title">График смен на сегодня</div>
        <div id="adminShifts"><div class="loading">Загрузка...</div></div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">История смен</div>
        <div style="margin-bottom: 12px;">
          <input type="date" id="shiftHistoryStart" class="form-input" style="margin-bottom: 8px;">
          <input type="date" id="shiftHistoryEnd" class="form-input" style="margin-bottom: 8px;">
          <button class="btn btn-primary" onclick="loadShiftHistory()" style="width: 100%;">Показать</button>
        </div>
        <div id="adminShiftHistory"></div>
      </div>
    `;
  } else if (adminActiveTab === 'calendar') {
    contentHtml = `
      <div class="admin-card">
        <div class="admin-card-title">Редактор календаря</div>
        <div id="adminCalendarEditor">
          <div style="margin-bottom: 16px;">
            <input type="date" id="calDate" class="form-input" style="margin-bottom: 8px;">
            <input type="text" id="calTitle" class="form-input" placeholder="Заголовок заметки" style="margin-bottom: 8px;">
            <textarea id="calText" class="form-input" placeholder="Текст заметки" style="margin-bottom: 8px; min-height: 60px;"></textarea>
            <button class="btn btn-primary" onclick="addCalendarNote()" style="width: 100%;">➕ Добавить заметку</button>
          </div>
          <hr style="border: none; border-top: 1px solid var(--ios-gray5); margin: 16px 0;">
          <div style="margin-bottom: 16px;">
            <input type="date" id="todoDate" class="form-input" style="margin-bottom: 8px;">
            <input type="text" id="todoTitle" class="form-input" placeholder="Название задачи" style="margin-bottom: 8px;">
            <textarea id="todoDesc" class="form-input" placeholder="Описание задачи" style="margin-bottom: 8px; min-height: 60px;"></textarea>
            <button class="btn btn-primary" onclick="addTodoItem()" style="width: 100%;">➕ Добавить задачу</button>
          </div>
        </div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">Список заметок и задач</div>
        <div id="adminCalendarList"><div class="loading">Загрузка...</div></div>
      </div>
    `;
  }
  
  return `<div class="main-layout app-shell"><div class="header"><button class="back-btn" onclick="showMainMenu()">‹ Назад</button><div class="header-title">Админка</div><div></div></div>
    <div class="hero-card page-hero small-hero"><div><div class="hero-title">Управление системой</div><div class="hero-subtitle">Сводка по людям, сменам, синхронизации и рабочим данным.</div></div></div>
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
  if (tab === 'shifts') loadAdminShifts();
  if (tab === 'calendar') loadAdminCalendarList();
}

// Загрузить график смен
async function loadAdminShifts() {
  const container = document.getElementById('adminShifts');
  if (!container) return;
  
  const data = await apiGet('/api/shift/schedule');
  if (!data) {
    container.innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
    return;
  }
  
  let html = '';
  
  // Присутствующие
  if (data.shifts && data.shifts.length > 0) {
    html += `<h4 style="margin-bottom: 8px; color: var(--ios-gray); font-size: 14px;">✓ Присутствуют (${data.shifts.length})</h4>`;
    data.shifts.forEach(s => {
      const statusColor = s.status === 'on_time' ? 'var(--ios-green)' : 'var(--ios-orange)';
      const statusText = s.status === 'on_time' ? 'Вовремя' : 'Опоздание';
      html += `<div class="user-item" style="margin-bottom: 4px;">
        <div class="user-info">
          <div class="user-login">${s.user_name}</div>
          <div class="user-meta"><span style="color: ${statusColor}; font-weight: 600;">${statusText}</span> <span style="color: var(--ios-gray);">${s.start_time_yakutsk}</span></div>
        </div>
      </div>`;
    });
  }
  
  // Отсутствующие
  if (data.absent && data.absent.length > 0) {
    html += `<h4 style="margin: 16px 0 8px; color: var(--ios-gray); font-size: 14px;">✗ Отсутствуют (${data.absent.length})</h4>`;
    data.absent.forEach(u => {
      html += `<div class="user-item" style="margin-bottom: 4px; opacity: 0.7;">
        <div class="user-info">
          <div class="user-login">${u.user_name}</div>
          <div class="user-meta"><span style="color: var(--ios-red); font-weight: 600;">Не выход</span></div>
        </div>
      </div>`;
    });
  }
  
  if ((!data.shifts || data.shifts.length === 0) && (!data.absent || data.absent.length === 0)) {
    html = '<div class="empty-state">Нет данных</div>';
  }
  
  container.innerHTML = html;
}

// Загрузить историю смен
async function loadShiftHistory() {
  const container = document.getElementById('adminShiftHistory');
  if (!container) return;
  
  const startDate = document.getElementById('shiftHistoryStart').value;
  const endDate = document.getElementById('shiftHistoryEnd').value;
  
  if (!startDate || !endDate) {
    alert('Укажите период');
    return;
  }
  
  container.innerHTML = '<div class="loading">Загрузка...</div>';
  
  const data = await apiGet(`/api/shift/history?startDate=${startDate}&endDate=${endDate}`);
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет данных за период</div>';
    return;
  }
  
  let html = '';
  data.forEach(s => {
    const statusColor = s.status === 'on_time' ? 'var(--ios-green)' : s.status === 'late' ? 'var(--ios-orange)' : 'var(--ios-red)';
    html += `<div class="user-item" style="margin-bottom: 4px;">
      <div class="user-info">
        <div class="user-login">${s.user_name}</div>
        <div class="user-meta"><span class="user-role staff">${s.date}</span> <span style="color: ${statusColor}; font-weight: 600;">${s.status_text}</span></div>
        <div class="user-dates">${s.start_time_yakutsk || '-'}</div>
      </div>
    </div>`;
  });
  
  container.innerHTML = html;
}

// Добавить заметку в календарь
async function addCalendarNote() {
  const date = document.getElementById('calDate').value;
  const title = document.getElementById('calTitle').value.trim();
  const text = document.getElementById('calText').value.trim();
  
  if (!date || !title) {
    alert('Укажите дату и заголовок');
    return;
  }
  
  await apiPost('/api/calendar/items', { date, title, text });
  alert('Заметка добавлена');
  document.getElementById('calTitle').value = '';
  document.getElementById('calText').value = '';
  loadAdminCalendarList();
}

// Добавить to-do задачу
async function addTodoItem() {
  const date = document.getElementById('todoDate').value;
  const title = document.getElementById('todoTitle').value.trim();
  const description = document.getElementById('todoDesc').value.trim();
  
  if (!date || !title) {
    alert('Укажите дату и название задачи');
    return;
  }
  
  await apiPost('/api/calendar/todos', { date, title, description });
  alert('Задача добавлена');
  document.getElementById('todoTitle').value = '';
  document.getElementById('todoDesc').value = '';
  loadAdminCalendarList();
}

// Загрузить список заметок и задач для админки
async function loadAdminCalendarList() {
  const container = document.getElementById('adminCalendarList');
  if (!container) return;
  
  const today = new Date();
  const startDate = today.toISOString().split('T')[0];
  const endDateObj = new Date(today);
  endDateObj.setDate(today.getDate() + 30);
  const endDate = endDateObj.toISOString().split('T')[0];
  
  const [notes, todos] = await Promise.all([
    apiGet(`/api/calendar/items?startDate=${startDate}&endDate=${endDate}`),
    apiGet(`/api/calendar/todos-range?startDate=${startDate}&endDate=${endDate}`)
  ]);
  
  let html = '';
  
  // Заметки
  if (notes && notes.length > 0) {
    html += `<h4 style="margin-bottom: 8px; color: var(--ios-gray); font-size: 14px;">📝 Заметки</h4>`;
    notes.forEach(n => {
      html += `<div class="user-item" style="margin-bottom: 4px;">
        <div class="user-info">
          <div class="user-login">${n.title}</div>
          <div class="user-meta"><span class="user-role staff">${n.date}</span></div>
          <div class="user-dates">${n.text || ''}</div>
        </div>
        <button class="icon-btn" onclick="deleteCalendarNote(${n.id})" title="Удалить">🗑️</button>
      </div>`;
    });
  }
  
  // Задачи
  if (todos && todos.length > 0) {
    html += `<h4 style="margin: 16px 0 8px; color: var(--ios-gray); font-size: 14px;">✓ Задачи</h4>`;
    todos.forEach(t => {
      const status = t.is_completed ? `<span style="color: var(--ios-green);">✓ ${t.completed_by_name || ''}</span>` : '<span style="color: var(--ios-orange);">⏳ В процессе</span>';
      html += `<div class="user-item" style="margin-bottom: 4px;">
        <div class="user-info">
          <div class="user-login">${t.title}</div>
          <div class="user-meta"><span class="user-role staff">${t.date}</span> ${status}</div>
          <div class="user-dates">${t.description || ''}</div>
        </div>
        <button class="icon-btn" onclick="deleteTodoItem(${t.id})" title="Удалить">🗑️</button>
      </div>`;
    });
  }
  
  if ((!notes || notes.length === 0) && (!todos || todos.length === 0)) {
    html = '<div class="empty-state">Нет записей</div>';
  }
  
  container.innerHTML = html;
}

async function deleteCalendarNote(id) {
  if (!confirm('Удалить заметку?')) return;
  await fetch(`${API_URL}/api/calendar/items/${id}`, { method: 'DELETE', credentials: 'include' });
  loadAdminCalendarList();
}

async function deleteTodoItem(id) {
  if (!confirm('Удалить задачу?')) return;
  await fetch(`${API_URL}/api/calendar/todos/${id}`, { method: 'DELETE', credentials: 'include' });
  loadAdminCalendarList();
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
