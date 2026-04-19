// ZAN 2.0 - Main Application (Gen Z Redesign) - СОВМЕСТНАЯ РАБОТА
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

// ==========================================
// Toast Notification System
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ';
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${message}</span>`;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast-show');
  });

  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 3000);
}

// ==========================================
// Bottom Sheet System
// ==========================================
function showBottomSheet(content) {
  const container = document.getElementById('bottomSheetContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="bottom-sheet-overlay" onclick="closeBottomSheet()">
      <div class="bottom-sheet" onclick="event.stopPropagation()">
        <div class="bottom-sheet-handle"></div>
        <div class="bottom-sheet-content">${content}</div>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    container.querySelector('.bottom-sheet-overlay').classList.add('active');
  });
}

function closeBottomSheet() {
  const container = document.getElementById('bottomSheetContainer');
  if (!container) return;
  const overlay = container.querySelector('.bottom-sheet-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.addEventListener('transitionend', () => {
      container.innerHTML = '';
    });
  }
}

// ==========================================
// Animation Utilities
// ==========================================
function animateValue(el, from, to, duration) {
  const start = performance.now();
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + (to - from) * eased);
    el.textContent = current.toLocaleString('ru-RU');
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// Skeleton loader HTML generators
function skeletonCard() {
  return `<div class="product-card skeleton-card">
    <div class="skeleton skeleton-image"></div>
    <div class="skeleton skeleton-text" style="width: 80%; margin: 10px;"></div>
    <div class="skeleton skeleton-text" style="width: 50%; margin: 0 10px 10px;"></div>
  </div>`;
}

function skeletonCategory() {
  return `<div class="category-item card">
    <div class="skeleton skeleton-circle" style="width:44px;height:44px;"></div>
    <div style="flex:1">
      <div class="skeleton skeleton-text" style="width:60%;"></div>
      <div class="skeleton skeleton-text" style="width:40%; margin-top:8px;"></div>
    </div>
  </div>`;
}

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
  return `<div class="login-screen">
    <!-- Animated background mesh -->
    <div class="login-bg-mesh">
      <div class="login-blob login-blob-1"></div>
      <div class="login-blob login-blob-2"></div>
      <div class="login-blob login-blob-3"></div>
    </div>
    <!-- Floating particles -->
    <div class="login-particles">
      ${Array.from({length: 12}, (_, i) =>
        `<div class="particle" style="--delay:${i*0.5}s;--x:${Math.floor(Math.random()*100)}%;--size:${Math.floor(2+Math.random()*4)}px"></div>`
      ).join('')}
    </div>
    <div class="login-shell">
      <!-- Logo with gradient -->
      <div class="login-logo-container">
        <div class="login-logo-mark">&#9670;</div>
        <div class="login-logo-text">ZAN</div>
        <div class="login-tagline">Склад будущего</div>
      </div>
      <div class="login-glass-card">
        <div class="login-form-header">
          <div class="login-eyebrow">Вход в систему</div>
          <div class="login-title">С возвращением</div>
        </div>
        <form class="login-form" onsubmit="handleLogin(event)">
          <div class="input-group">
            <input type="text" class="login-input" id="login" placeholder=" " required autocomplete="username">
            <label class="input-label" for="login">Логин</label>
          </div>
          <div class="input-group">
            <input type="password" class="login-input" id="password" placeholder=" " required autocomplete="current-password">
            <label class="input-label" for="password">Пароль</label>
          </div>
          <button type="submit" class="login-btn">
            <span class="btn-text">Продолжить</span>
            <span class="btn-arrow">&#8594;</span>
          </button>
        </form>
      </div>
      <div class="login-footer">
        <span class="version-badge">v2.0</span>
      </div>
    </div>
  </div>`;
}

async function handleLogin(e) {
  e.preventDefault();
  const login = document.getElementById('login').value;
  const password = document.getElementById('password').value;
  const result = await apiPost('/api/auth/login', { login, password });
  if (result.error) { showToast('Неверный логин или пароль', 'error'); return; }
  currentUser = result;
  showMainMenu();
}

function showLogin() { currentView = 'login'; renderApp(); }
async function handleLogout() { await apiPost('/api/auth/logout', {}); currentUser = null; showLogin(); }

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; const btn = document.getElementById('installBtn'); if (btn) btn.style.display = 'block'; });
async function installApp() { if (!deferredPrompt) return; deferredPrompt.prompt(); const result = await deferredPrompt.userChoice; if (result.outcome === 'accepted') { document.getElementById('installBtn').style.display = 'none'; } deferredPrompt = null; }
function checkInstallPrompt() { if (deferredPrompt) { const btn = document.getElementById('installBtn'); if (btn) btn.style.display = 'block'; } }

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
        <div class="header-eyebrow" style="color: var(--neon-purple);">Рабочее пространство</div>
        <div class="header-title" style="background: linear-gradient(135deg, var(--neon-purple), var(--neon-cyan)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">ZAN</div>
      </div>
      <div class="header-user glass-inline">
        <span id="shiftIndicator" style="margin-right: 8px; font-size: 13px;"></span>
        <span class="header-user-name">${currentUser.login}</span>
        <button class="logout-btn" onclick="handleLogout()">Выйти</button>
      </div>
    </div>
    <div class="hero-card compact-hero glass-card">
      <div>
        <div class="hero-title" style="color: var(--neon-cyan);">Склад под рукой</div>
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
      <div class="menu-item card" onclick="showCarryCategories()" style="border-left: 3px solid var(--neon-purple);">
        <div class="menu-icon" style="background: linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.05));">📦</div>
        <div class="menu-label">Заявка на занос</div>
      </div>
      <div class="menu-item card" onclick="showPriceCheckCategories()" style="border-left: 3px solid var(--neon-cyan);">
        <div class="menu-icon" style="background: linear-gradient(135deg, rgba(6,182,212,0.2), rgba(6,182,212,0.05));">🏷️</div>
        <div class="menu-label">Проверка ценников</div>
      </div>
      <div class="menu-item card" onclick="showProductCheck()" style="border-left: 3px solid var(--neon-green);">
        <div class="menu-icon" style="background: linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.05));">📋</div>
        <div class="menu-label">Проверка товара</div>
      </div>
      <div class="menu-item card" onclick="showCalendar()" style="border-left: 3px solid var(--neon-pink);">
        <div class="menu-icon" style="background: linear-gradient(135deg, rgba(236,72,153,0.2), rgba(236,72,153,0.05));">📅</div>
        <div class="menu-label">Календарь недели</div>
      </div>
      ${isAdmin ? `<div class="menu-item card" onclick="showAdmin()" style="border-left: 3px solid var(--neon-orange);">
        <div class="menu-icon" style="background: linear-gradient(135deg, rgba(249,115,22,0.2), rgba(249,115,22,0.05));">⚙️</div>
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
    indicator.innerHTML = `<span style="color: var(--neon-green);">✓ Смена начата ${shiftTime}</span>`;
  } else if (shiftStatus === 'late') {
    indicator.innerHTML = `<span style="color: var(--neon-orange);">⚠ Опоздание ${shiftTime}</span>`;
  } else if (shiftStatus === 'no_show') {
    indicator.innerHTML = `<span style="color: var(--neon-red);">✗ Не выход</span>`;
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

// ===== ЗАЯВКА НА ЗАНОС - ОБНОВЛЁННЫЙ ДИЗАЙН =====

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

      // Градиент фона для буквы категории
      const hue = (c.name.charCodeAt(0) * 37) % 360;
      const gradientBg = `linear-gradient(135deg, hsl(${hue}, 70%, 60%), hsl(${hue}, 70%, 40%))`;
      const firstLetter = c.name.charAt(0).toUpperCase();

      let metaHtml = '';
      if (totalItems > 0) {
        const usersText = userNames.length > 0 ? `${userNames.slice(0, 2).join(', ')}${userNames.length > 2 ? '...' : ''}` : '';
        metaHtml = `<div class="category-meta">${totalItems} поз. ${usersText ? '• ' + usersText : ''}</div>`;
      }

      let progressHtml = '';
      if (totalItems > 0 && status?.completed_items !== undefined && status?.total_items) {
        const pct = Math.round((status.completed_items / status.total_items) * 100);
        progressHtml = `<div class="category-progress"><div class="category-progress-fill" style="width: ${pct}%; background: ${isCompleted ? 'var(--neon-green)' : 'var(--neon-purple)'}"></div></div>`;
      }

      return `<div class="category-item card ${isCompleted ? 'completed' : ''} ${totalItems > 0 ? 'has-items' : ''}" onclick="showCarryProducts(${c.id}, '${c.name.replace(/'/g, "\'")}')" style="${isCompleted ? 'border-left: 3px solid var(--neon-green);' : totalItems > 0 ? 'border-left: 3px solid var(--neon-purple);' : ''}">
        <div class="category-letter" style="background: ${gradientBg};">${firstLetter}</div>
        <div class="category-info">
          <div class="category-name">${isCompleted ? '✓ ' : ''}${c.name}</div>
          ${metaHtml}
          ${progressHtml}
        </div>
        <div class="category-arrow" style="color: ${isCompleted ? 'var(--neon-green)' : totalItems > 0 ? 'var(--neon-purple)' : 'var(--text-muted)'};">${isCompleted ? '✓' : '›'}</div>
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
    <div class="hero-card page-hero glass-card" style="border-left: 4px solid var(--neon-purple);">
      <div>
        <div class="hero-title" style="color: var(--neon-purple);">Категории</div>
        <div class="hero-subtitle">Открывай раздел и сразу добавляй позиции. Сборка остаётся общей.</div>
      </div>
    </div>
    <div class="categories-list" id="categoriesList">
      <!-- Скелетон загрузчик -->
      <div class="skeleton-list">
        <div class="skeleton-item"><div class="skeleton-circle"></div><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
        <div class="skeleton-item"><div class="skeleton-circle"></div><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
        <div class="skeleton-item"><div class="skeleton-circle"></div><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
        <div class="skeleton-item"><div class="skeleton-circle"></div><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
      </div>
    </div>
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
    statsEl.innerHTML = `<div class="glass-card" style="margin: 0 16px 12px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
      <div style="display: flex; gap: 16px; align-items: center;">
        <span class="badge badge-purple">📦 ${categoryStats.total_items || 0} поз.</span>
        <span class="badge badge-cyan">👥 ${categoryStats.total_users || 0} участников</span>
      </div>
      ${usersText ? `<div style="font-size: 12px; color: var(--text-muted); width: 100%;">${usersText}</div>` : ''}
    </div>`;
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
    <div class="products-grid" id="productsGrid">
      <!-- Скелетон загрузчик -->
      <div class="skeleton-grid">
        <div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-line"></div></div>
        <div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-line"></div></div>
        <div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-line"></div></div>
        <div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-line"></div></div>
      </div>
    </div>
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
  if (grid.children.length === currentProducts.length && !grid.querySelector('.skeleton-grid')) {
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

    return `<div class="product-card card ${stockStatus.class}" onclick="addToCarry(${p.id}, ${step})" data-product-id="${p.id}">
      <div style="position: relative; aspect-ratio: 1/1; overflow: hidden; border-radius: 12px;">
        ${createCachedImage(imgUrl, 'product-image', p.name)}
        ${qty > 0 ? `<div class="product-qty-left" onclick="event.stopPropagation(); removeFromCarry(${p.id}, ${step})">${qty}</div>` : ''}
        ${clickData ? `<div class="product-click-indicator" style="background-color: ${clickData.color}; box-shadow: 0 0 8px ${clickData.color};" title="Нажал: ${clickData.login}"></div>` : ''}
        ${stockStatus.text ? `<div class="stock-badge ${stockStatus.class}">${stockStatus.text}</div>` : ''}
      </div>
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

// Carry Assembly - СБОРКА (ОБНОВЛЁННЫЙ ДИЗАЙН)
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
    <div class="hero-card page-hero glass-card" style="border-left: 4px solid var(--neon-purple);">
      <div>
        <div class="hero-title" style="color: var(--neon-purple);">Общая заявка</div>
        <div class="hero-subtitle">Отмечай собранные позиции и держи темп без лишних переходов.</div>
      </div>
    </div>
    <div id="assemblyStats"></div>
    <div id="assemblyList" style="padding: 0 16px;">
      <!-- Скелетон загрузчик -->
      <div class="skeleton-list">
        <div class="skeleton-item"><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
        <div class="skeleton-item"><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
        <div class="skeleton-item"><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
      </div>
    </div>
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
    container.innerHTML = '<div class="empty-state"><div class="empty-icon" style="font-size: 48px; margin-bottom: 12px;">🛒</div>Нет товаров в сборке<br><small style="color: var(--text-muted);">Выберите товары в категориях</small></div>'; 
    if (statsEl) statsEl.innerHTML = '';
    return; 
  }

  // Статистика сборки
  const totalItems = items.length;
  const collectedCount = items.filter(i => collectedIds.has(i.product_id)).length;

  if (statsEl) {
    statsEl.innerHTML = `<div class="glass-card" style="margin: 0 16px 16px; padding: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-weight: 600; color: var(--text-primary);">Собрано: <span style="color: var(--neon-green);">${collectedCount}</span> / ${totalItems}</span>
        <span class="badge ${collectedCount === totalItems ? 'badge-green' : 'badge-purple'}">${Math.round((collectedCount/totalItems)*100)}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width: ${(collectedCount/totalItems*100)}%"></div></div>
    </div>`;
  }

  container.innerHTML = items.map(item => {
    const isCollected = collectedIds.has(item.product_id);
    const contributors = item.contributions || [];
    const contributorsText = contributors.map(c => `${c.login}: ${c.quantity}`).join(', ');

    return `<div class="assembly-item card ${isCollected ? 'collected' : ''}" style="${isCollected ? 'opacity: 0.6; border-left: 3px solid var(--neon-green);' : 'border-left: 3px solid var(--neon-purple);'} margin-bottom: 10px;">
      <div class="assembly-content">
        <div style="font-weight: 600; color: var(--text-primary); ${isCollected ? 'text-decoration: line-through;' : ''}">${item.product_name}</div>
        <div class="product-code" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${item.vendor_code || ''} | ${item.category_name}</div>
        ${contributorsText ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">👥 ${contributorsText}</div>` : ''}
      </div>
      <div class="assembly-qty" style="background: var(--neon-cyan); color: #000; font-weight: 700; min-width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 14px;">${item.total_quantity}</div>
      <div class="assembly-checkbox ${isCollected ? 'checked' : ''}" id="cb-${item.product_id}" onclick="toggleCollectedGlobal(${item.product_id})" style="${isCollected ? 'background: var(--neon-green); border-color: var(--neon-green);' : ''}">
        ${isCollected ? '<span style="color: #000; font-size: 16px;">✓</span>' : ''}
      </div>
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

// Price Check - ОБНОВЛЁННЫЙ ДИЗАЙН
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
    <div class="hero-card page-hero glass-card" style="border-left: 4px solid var(--neon-cyan);">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div class="hero-title" style="color: var(--neon-cyan);">Быстрая ревизия</div>
          <div class="hero-subtitle">Тап по карточке — отметь проблему, срок или отсутствие товара.</div>
        </div>
        <div id="priceCheckTotal" class="badge badge-cyan" style="white-space: nowrap;"></div>
      </div>
    </div>
    <div class="price-check-grid" id="priceCheckGrid" style="padding: 0 16px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
      <!-- Скелетон загрузчик -->
      <div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-line"></div></div>
      <div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-line"></div></div>
      <div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-line"></div></div>
      <div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-line"></div></div>
    </div>
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
    totalEl.textContent = `Всего: ${totalData.count}`;
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
      html += `<button class="page-btn active" style="background: linear-gradient(135deg, var(--neon-cyan), var(--neon-purple)); color: #fff; border: none; font-weight: 700;">${i}</button>`;
    } else {
      html += `<button class="page-btn" onclick="changePriceCheckPage(${i})">${i}</button>`;
    }
  }

  // Кнопка "Далее" если есть ещё страницы
  if (endPage < priceCheckTotalPages) {
    html += `<span style="padding: 8px; color: var(--text-muted);">...</span>`;
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
    grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">Нет товаров</div>';
    return;
  }

  grid.innerHTML = products.map(p => {
    const imgUrl = getImageUrl(p.picture);
    const hasMark = priceCheckMarks[p.id];
    const trafficLight = getExpiryTrafficLight(p.expiry_date);
    const expiryFormatted = formatExpiryDate(p.expiry_date);

    return `<div class="price-check-card card" onclick="openPriceCheckModal(${p.id}, '${p.name.replace(/'/g, "\\'")}', '${p.vendor_code || ''}', '${p.expiry_date || ''}')" style="overflow: hidden; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 32px rgba(6,182,212,0.15)';" onmouseout="this.style.transform=''; this.style.boxShadow='';">
      <div class="price-check-image-wrapper" style="position: relative; aspect-ratio: 1/1; overflow: hidden;">
        ${createCachedImage(imgUrl, 'price-check-image', p.name)}
        ${hasMark ? '<div class="price-check-mark" style="position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; background: var(--neon-red); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; box-shadow: 0 0 12px rgba(255,59,48,0.5);">!</div>' : ''}
      </div>
      <div class="price-check-info" style="padding: 10px 12px;">
        <div class="price-check-name" style="font-weight: 600; font-size: 13px; color: var(--text-primary); line-height: 1.3; margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.name}</div>
        <div class="price-check-code" style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">${p.vendor_code || ''}</div>
        ${expiryFormatted ? `<div class="price-check-expiry" style="color: ${trafficLight}; font-weight: 600; font-size: 12px; display: inline-block; padding: 2px 8px; border-radius: 6px; background: ${trafficLight}22;">${expiryFormatted}</div>` : '<div style="font-size: 12px; color: var(--text-muted);">—</div>'}
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

  if (diffDays > 90) return 'var(--neon-green)'; // Зелёный
  if (diffDays >= 60) return 'var(--neon-orange)'; // Жёлтый
  return 'var(--neon-red)'; // Красный
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
    <div class="modal-content glass-card" style="max-width: 400px; border: 1px solid rgba(6,182,212,0.3);">
      <h3 style="margin-bottom: 16px; text-align: center; font-size: 16px; line-height: 1.3; max-height: 65px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; color: var(--text-primary);">${productName}</h3>
      <div style="margin-bottom: 16px; color: var(--text-muted); text-align: center;">
        <div style="font-weight: 700; color: var(--neon-cyan); font-size: 18px;">${vendorCode || '-'}</div>
        ${expiryFormatted ? `<div style="margin-top: 4px;">Срок годности: ${expiryFormatted}</div>` : ''}
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label class="price-check-option ${existingMark === 'no_product' ? 'selected' : ''}" style="padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
          <input type="radio" name="markType" value="no_product" ${existingMark === 'no_product' ? 'checked' : ''} onchange="toggleExpiryInput(false)" style="accent-color: var(--neon-cyan);">
          <span style="color: var(--text-primary);">Нет такого товара</span>
        </label>
        <label class="price-check-option ${existingMark === 'no_price_tag' ? 'selected' : ''}" style="padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
          <input type="radio" name="markType" value="no_price_tag" ${existingMark === 'no_price_tag' ? 'checked' : ''} onchange="toggleExpiryInput(false)" style="accent-color: var(--neon-cyan);">
          <span style="color: var(--text-primary);">Нету ценника</span>
        </label>
        <label class="price-check-option ${existingMark === 'fix_expiry' ? 'selected' : ''}" style="padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
          <input type="radio" name="markType" value="fix_expiry" ${existingMark === 'fix_expiry' ? 'checked' : ''} onchange="toggleExpiryInput(true)" style="accent-color: var(--neon-cyan);">
          <span style="color: var(--text-primary);">Исправить срок годности</span>
        </label>
        <div id="expiryInputContainer" style="display: none; padding-left: 32px;">
          <input type="date" id="newExpiryDate" class="form-input" style="margin-bottom: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 8px; padding: 10px;" value="${expiryDate || ''}">
        </div>
        <label class="price-check-option ${existingMark === 'remove' ? 'selected' : ''}" style="padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
          <input type="radio" name="markType" value="remove" ${existingMark === 'remove' ? 'checked' : ''} onchange="toggleExpiryInput(false)" style="accent-color: var(--neon-cyan);">
          <span style="color: var(--text-primary);">Удалить отметку</span>
        </label>
      </div>
      <div class="modal-actions" style="margin-top: 20px; display: flex; gap: 10px;">
        <button class="btn btn-secondary" style="flex: 1;" onclick="closePriceCheckModal()">Отмена</button>
        <button class="btn btn-primary" style="flex: 1; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-purple));" onclick="savePriceCheckMark(${productId})">OK</button>
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
            <td style="padding: 6px; text-align: center; color: ${item.no_product ? '#FF3B30' : '#ccc'}; font-weight: bold;">${item.no_product || '○'}</td>
            <td style="padding: 6px; text-align: center; color: ${item.no_price_tag ? '#FF3B30' : '#ccc'}; font-weight: bold;">${item.no_price_tag || '○'}</td>
            <td style="padding: 6px; text-align: center; color: ${item.fix_expiry ? '#FF3B30' : '#ccc'}; font-weight: bold;">${item.fix_expiry || '○'}</td>
            <td style="padding: 6px; text-align: center; color: ${item.new_expiry ? '#007AFF' : '#ccc'}; font-weight: bold;">${item.new_expiry || '—'}</td>
            <td style="padding: 6px; text-align: center; color: ${item.remove_mark ? '#FF3B30' : '#ccc'}; font-weight: bold;">${item.remove_mark || '○'}</td>
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

// Product Check - ОБНОВЛЁННЫЙ ДИЗАЙН
async function showProductCheck() { 
  currentView = 'product-check'; 
  renderApp(); 
  const products = await apiGet('/api/product-check/missing-barcodes'); 
  const list = document.getElementById('pcMissingList'); 
  if (list) { 
    if (products.length === 0) { 
      list.innerHTML = `<div class="empty-state">
        <div style="font-size: 56px; margin-bottom: 16px; animation: pulse 2s infinite;">✨</div>
        <div style="font-weight: 600; color: var(--neon-green); margin-bottom: 8px;">Все товары имеют штрих-коды</div>
        <div style="font-size: 13px; color: var(--text-muted);">Проблем не обнаружено</div>
      </div>`; 
    } else { 
      list.innerHTML = products.map(p => `<div class="card assembly-item" style="border-left: 3px solid var(--neon-orange); margin-bottom: 8px; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 14px;">${p.name}</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${p.category_name} | ${p.vendor_code || ''}</div>
        </div>
        <button class="btn btn-small btn-secondary" style="min-width: 36px; height: 36px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 16px;" onclick="hideProduct(${p.id})">✕</button>
      </div>`).join(''); 
    } 
  } 
}

function renderProductCheck() { 
  return `<div class="main-layout app-shell">
    <div class="header">
      <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
      <div class="header-title">Проверка товара</div>
      <div></div>
    </div>
    <div class="hero-card page-hero glass-card" style="border-left: 4px solid var(--neon-green);">
      <div>
        <div class="hero-title" style="color: var(--neon-green);">Контроль карточек</div>
        <div class="hero-subtitle">Проверь отсутствующие штрихкоды и проблемные товары без визуального шума.</div>
      </div>
    </div>
    <div id="pcMissingList" style="padding: 16px;">
      <!-- Скелетон загрузчик -->
      <div class="skeleton-list">
        <div class="skeleton-item"><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
        <div class="skeleton-item"><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
        <div class="skeleton-item"><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
      </div>
    </div>
  </div>`; 
}

async function hideProduct(productId) { await apiPost('/api/product-check/hide', { productId }); showProductCheck(); }

// Calendar - 4 недели с to-do задачами - ОБНОВЛЁННЫЙ ДИЗАЙН
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
    <div class="calendar-toolbar glass-card" style="margin: 0 16px 16px; padding: 12px; display: flex; justify-content: space-between; align-items: center; border-radius: 16px;">
      <button class="btn btn-secondary btn-small" onclick="changeCalendarWeek(-1)">‹ Неделя</button>
      <span class="badge badge-pink">${calendarWeekOffset === 0 ? 'Текущая' : calendarWeekOffset > 0 ? '+' + calendarWeekOffset : calendarWeekOffset} неделя</span>
      <button class="btn btn-secondary btn-small" onclick="changeCalendarWeek(1)">Неделя ›</button>
    </div>`;

  // 4 недели
  for (let week = 0; week < 4; week++) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() + (week * 7));

    html += `<div style="padding: 8px 16px 4px; font-size: 11px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${week === 0 ? 'Текущая' : '+' + week} неделя</div>`;
    html += `<div class="calendar-grid" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; padding: 0 16px; margin-bottom: 12px;">`;

    for (let i = 0; i < 7; i++) { 
      const d = new Date(weekStart); 
      d.setDate(weekStart.getDate() + i); 
      const isToday = d.toDateString() === today.toDateString();
      const dateStr = d.toISOString().split('T')[0];
      const hasNotes = calendarNotes[dateStr]?.length > 0;
      const hasTodos = calendarTodos[dateStr]?.length > 0;
      const hasEvents = hasNotes || hasTodos;
      const dayName = days[i];
      const dayNum = d.getDate();

      // Определяем стили для ячейки
      let cellStyle = '';
      let numStyle = '';
      let dotHtml = '';

      if (isToday) {
        cellStyle = 'background: linear-gradient(135deg, rgba(168,85,247,0.3), rgba(236,72,153,0.3)); border: 1px solid var(--neon-purple); box-shadow: 0 0 20px rgba(168,85,247,0.3); color: #fff; font-weight: 700;';
        numStyle = 'color: #fff; font-weight: 700;';
      } else if (hasEvents) {
        cellStyle = 'background: rgba(255,255,255,0.05); border: 1px solid rgba(236,72,153,0.3);';
        numStyle = 'color: var(--text-primary);';
      } else {
        cellStyle = 'background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);';
        numStyle = 'color: var(--text-secondary);';
      }

      if (hasTodos) {
        dotHtml = '<span style="width: 6px; height: 6px; border-radius: 50%; background: var(--neon-pink); box-shadow: 0 0 6px var(--neon-pink); margin-top: 4px;"></span>';
      }

      html += `<div class="calendar-day ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}" onclick="showDayDetails('${dateStr}')" style="${cellStyle} border-radius: 14px; padding: 8px 4px; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: all 0.2s; min-height: 60px;" onmouseover="this.style.transform='scale(1.05)';" onmouseout="this.style.transform='';">
        <span style="font-size: 10px; font-weight: 600; opacity: 0.7; margin-bottom: 4px; ${isToday ? 'color: var(--neon-purple);' : 'color: var(--text-muted);'}">${dayName}</span>
        <span style="font-size: 18px; ${numStyle}">${dayNum}</span>
        ${dotHtml}
      </div>`; 
    }
    html += `</div>`;
  }

  html += `<div class="calendar-events glass-card" id="calendarEvents" style="margin: 0 16px 16px; border-radius: 16px; padding: 16px;"><div class="empty-state" style="padding: 32px;">📅 Выберите дату</div></div>`;
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

  // Убираем active у всех дней и ставим на выбранный
  document.querySelectorAll('.calendar-day').forEach(el => {
    el.style.border = el.classList.contains('today') ? '1px solid var(--neon-purple)' : '1px solid rgba(255,255,255,0.05)';
  });

  const notes = calendarNotes[dateStr] || [];
  const todos = calendarTodos[dateStr] || [];

  const d = new Date(dateStr);
  const dateFormatted = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' });

  let html = `<div style="padding: 8px;">
    <h3 style="margin-bottom: 16px; font-size: 18px; color: var(--neon-pink); font-weight: 700;">${dateFormatted}</h3>`;

  // Заметки
  if (notes.length > 0) {
    html += `<div style="margin-bottom: 20px;">
      <h4 style="font-size: 13px; color: var(--text-muted); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">📝 Заметки</h4>`;
    notes.forEach(n => {
      html += `<div class="card" style="padding: 12px 14px; margin-bottom: 8px; border-left: 3px solid var(--neon-cyan);">
        <div style="font-weight: 600; color: var(--text-primary); font-size: 14px; margin-bottom: 4px;">${n.title}</div>
        <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.4;">${n.text || ''}</div>
      </div>`;
    });
    html += `</div>`;
  }

  // To-do задачи
  if (todos.length > 0) {
    html += `<div>
      <h4 style="font-size: 13px; color: var(--text-muted); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">✓ Задачи</h4>`;
    todos.forEach(t => {
      const isCompleted = t.is_completed;
      const completedBy = t.completed_by_name ? ` (${t.completed_by_name})` : '';
      html += `<div class="card todo-item ${isCompleted ? 'completed' : ''}" onclick="toggleTodo(${t.id})" style="cursor: pointer; padding: 12px 14px; margin-bottom: 8px; display: flex; align-items: flex-start; gap: 12px; border-left: 3px solid ${isCompleted ? 'var(--neon-green)' : 'var(--neon-orange)'};">
        <div style="width: 22px; height: 22px; border-radius: 50%; border: 2px solid ${isCompleted ? 'var(--neon-green)' : 'rgba(255,255,255,0.2)'}; background: ${isCompleted ? 'var(--neon-green)' : 'transparent'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
          ${isCompleted ? '<span style="color: #000; font-size: 12px; font-weight: 700;">✓</span>' : ''}
        </div>
        <div style="flex: 1;">
          <div style="${isCompleted ? 'text-decoration: line-through; color: var(--text-muted);' : 'color: var(--text-primary);'} font-weight: 500; font-size: 14px;">${t.title}</div>
          ${t.description ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${t.description}</div>` : ''}
          ${isCompleted ? `<div style="font-size: 11px; color: var(--neon-green); margin-top: 4px;">✓ Выполнил${completedBy}</div>` : ''}
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  if (notes.length === 0 && todos.length === 0) {
    html += `<div class="empty-state" style="padding: 32px;">
      <div style="font-size: 40px; margin-bottom: 12px;">📝</div>
      <div style="color: var(--text-muted); font-size: 14px;">Нет записей на эту дату</div>
    </div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}

async function toggleTodo(todoId) {
  await apiPost(`/api/calendar/todos/${todoId}/toggle`, {});
  // Перезагружаем данные
  await loadCalendarData();
  // Обновляем отображение текущего дня
  const activeDate = document.querySelector('.calendar-day.today');
  if (activeDate) {
    // Находим дату из onclick атрибута
    const onclickAttr = activeDate.getAttribute('onclick');
    const dateMatch = onclickAttr?.match(/'(\d{4}-\d{2}-\d{2})'/);
    if (dateMatch) {
      showDayDetails(dateMatch[1]);
    }
  }
}

// Admin - ОБНОВЛЁННЫЙ ДИЗАЙН
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
    const statusColor = syncStatus.status === 'completed' ? 'var(--neon-green)' : (syncStatus.status === 'running' ? 'var(--neon-cyan)' : 'var(--neon-orange)');
    container.innerHTML = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
      <div class="card" style="padding: 16px; text-align: center; border-top: 3px solid var(--neon-cyan);">
        <div style="font-size: 28px; font-weight: 800; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${data.onlineUsers}</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Онлайн</div>
      </div>
      <div class="card" style="padding: 16px; text-align: center; border-top: 3px solid var(--neon-purple);">
        <div style="font-size: 28px; font-weight: 800; background: linear-gradient(135deg, var(--neon-purple), var(--neon-pink)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${data.totalProducts}</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Товаров</div>
      </div>
      <div class="card" style="padding: 16px; text-align: center; border-top: 3px solid var(--neon-orange);">
        <div style="font-size: 28px; font-weight: 800; color: var(--neon-orange);">${data.missingBarcodes}</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Без штрих-кода</div>
      </div>
      <div class="card" style="padding: 16px; text-align: center; border-top: 3px solid var(--neon-green);">
        <div style="font-size: 14px; font-weight: 700; color: ${statusColor}; text-transform: uppercase;">${syncStatus.status || 'idle'}</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Синхронизация</div>
      </div>
    </div>
    ${syncStatus.message ? `<div style="margin-top: 12px; font-size: 13px; color: var(--text-muted); padding: 12px; background: rgba(255,255,255,0.03); border-radius: 12px;">${syncStatus.message}</div>` : ''}
    ${syncStatus.status === 'running' ? `<div style="margin-top: 12px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;"><div style="height: 100%; width: ${syncStatus.progress || 0}%; background: linear-gradient(90deg, var(--neon-cyan), var(--neon-purple)); border-radius: 3px; transition: width 0.3s;"></div></div>` : ''}`;
  }
}

// Admin Tabs State
let adminActiveTab = 'overview';

function renderAdmin() {
  const isAdmin = currentUser?.role === 'admin';
  const tabsHtml = `
    <div class="admin-tabs" style="display: flex; gap: 4px; padding: 0 16px; margin-bottom: 16px; overflow-x: auto;">
      <div class="admin-tab ${adminActiveTab === 'overview' ? 'active' : ''}" onclick="switchAdminTab('overview')" style="padding: 10px 16px; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; ${adminActiveTab === 'overview' ? 'background: linear-gradient(135deg, var(--neon-orange), var(--neon-red)); color: #fff;' : 'background: rgba(255,255,255,0.05); color: var(--text-muted);'}">Обзор</div>
      <div class="admin-tab ${adminActiveTab === 'users' ? 'active' : ''}" onclick="switchAdminTab('users')" style="padding: 10px 16px; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; ${adminActiveTab === 'users' ? 'background: linear-gradient(135deg, var(--neon-orange), var(--neon-red)); color: #fff;' : 'background: rgba(255,255,255,0.05); color: var(--text-muted);'}">Пользователи</div>
      <div class="admin-tab ${adminActiveTab === 'locks' ? 'active' : ''}" onclick="switchAdminTab('locks')" style="padding: 10px 16px; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; ${adminActiveTab === 'locks' ? 'background: linear-gradient(135deg, var(--neon-orange), var(--neon-red)); color: #fff;' : 'background: rgba(255,255,255,0.05); color: var(--text-muted);'}">Блокировки</div>
      <div class="admin-tab ${adminActiveTab === 'shifts' ? 'active' : ''}" onclick="switchAdminTab('shifts')" style="padding: 10px 16px; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; ${adminActiveTab === 'shifts' ? 'background: linear-gradient(135deg, var(--neon-orange), var(--neon-red)); color: #fff;' : 'background: rgba(255,255,255,0.05); color: var(--text-muted);'}">Смены</div>
      ${isAdmin ? `<div class="admin-tab ${adminActiveTab === 'calendar' ? 'active' : ''}" onclick="switchAdminTab('calendar')" style="padding: 10px 16px; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; ${adminActiveTab === 'calendar' ? 'background: linear-gradient(135deg, var(--neon-orange), var(--neon-red)); color: #fff;' : 'background: rgba(255,255,255,0.05); color: var(--text-muted);'}">Календарь</div>` : ''}
    </div>
  `;

  let contentHtml = '';
  if (adminActiveTab === 'overview') {
    contentHtml = `
      <div class="card" style="padding: 16px; margin: 0 16px 12px;"><div style="font-size: 16px; font-weight: 700; color: var(--neon-orange); margin-bottom: 12px;">📊 Обзор системы</div><div id="adminOverview"><div class="skeleton-list"><div class="skeleton-item"><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div></div></div></div>
      <div class="card" style="padding: 16px; margin: 0 16px 12px;"><div style="font-size: 16px; font-weight: 700; color: var(--neon-cyan); margin-bottom: 12px;">🔄 Синхронизация</div>
        <button class="btn btn-primary" onclick="startSync()" style="margin-bottom: 8px; width: 100%; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-purple));">🔄 Обновить каталог</button>
        <button class="btn btn-secondary" onclick="resetSync()" style="width: 100%;">Сбросить обновление</button>
      </div>
      ${isAdmin ? `
      <div class="card" style="padding: 16px; margin: 0 16px 12px;"><div style="font-size: 16px; font-weight: 700; color: var(--neon-red); margin-bottom: 12px;">🗑️ Сборка</div>
        <button class="btn btn-danger" onclick="clearAllAssembly()" style="width: 100%;">🗑️ Очистить все заявки</button>
      </div>` : ''}
    `;
  } else if (adminActiveTab === 'users') {
    contentHtml = `<div class="card" style="padding: 16px; margin: 0 16px 12px;"><div style="font-size: 16px; font-weight: 700; color: var(--neon-orange); margin-bottom: 12px;">👥 Управление пользователями</div><div id="adminUsers"><div class="skeleton-list"><div class="skeleton-item"><div class="skeleton-lines"><div class="skeleton-line"></div></div></div></div></div></div>`;
  } else if (adminActiveTab === 'locks') {
    contentHtml = `<div class="card" style="padding: 16px; margin: 0 16px 12px;"><div style="font-size: 16px; font-weight: 700; color: var(--neon-orange); margin-bottom: 12px;">🔒 Блокировки страниц</div><div id="adminLocks"><div class="skeleton-list"><div class="skeleton-item"><div class="skeleton-lines"><div class="skeleton-line"></div></div></div></div></div></div>`;
  } else if (adminActiveTab === 'shifts') {
    contentHtml = `
      <div class="card" style="padding: 16px; margin: 0 16px 12px;">
        <div style="font-size: 16px; font-weight: 700; color: var(--neon-orange); margin-bottom: 12px;">📋 График смен на сегодня</div>
        <div id="adminShifts"><div class="skeleton-list"><div class="skeleton-item"><div class="skeleton-lines"><div class="skeleton-line"></div></div></div></div></div>
      </div>
      <div class="card" style="padding: 16px; margin: 0 16px 12px;">
        <div style="font-size: 16px; font-weight: 700; color: var(--neon-orange); margin-bottom: 12px;">📚 История смен</div>
        <div style="margin-bottom: 12px;">
          <input type="date" id="shiftHistoryStart" class="form-input" style="margin-bottom: 8px; width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 10px; padding: 10px 12px;">
          <input type="date" id="shiftHistoryEnd" class="form-input" style="margin-bottom: 8px; width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 10px; padding: 10px 12px;">
          <button class="btn btn-primary" onclick="loadShiftHistory()" style="width: 100%; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-purple));">Показать</button>
        </div>
        <div id="adminShiftHistory"></div>
      </div>
    `;
  } else if (adminActiveTab === 'calendar') {
    contentHtml = `
      <div class="card" style="padding: 16px; margin: 0 16px 12px;">
        <div style="font-size: 16px; font-weight: 700; color: var(--neon-orange); margin-bottom: 12px;">📅 Редактор календаря</div>
        <div id="adminCalendarEditor">
          <div style="margin-bottom: 16px;">
            <input type="date" id="calDate" class="form-input" style="margin-bottom: 8px; width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 10px; padding: 10px 12px;">
            <input type="text" id="calTitle" class="form-input" placeholder="Заголовок заметки" style="margin-bottom: 8px; width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 10px; padding: 10px 12px;">
            <textarea id="calText" class="form-input" placeholder="Текст заметки" style="margin-bottom: 8px; min-height: 60px; width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 10px; padding: 10px 12px;"></textarea>
            <button class="btn btn-primary" onclick="addCalendarNote()" style="width: 100%; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-purple));">➕ Добавить заметку</button>
          </div>
          <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 16px 0;">
          <div style="margin-bottom: 16px;">
            <input type="date" id="todoDate" class="form-input" style="margin-bottom: 8px; width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 10px; padding: 10px 12px;">
            <input type="text" id="todoTitle" class="form-input" placeholder="Название задачи" style="margin-bottom: 8px; width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 10px; padding: 10px 12px;">
            <textarea id="todoDesc" class="form-input" placeholder="Описание задачи" style="margin-bottom: 8px; min-height: 60px; width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 10px; padding: 10px 12px;"></textarea>
            <button class="btn btn-primary" onclick="addTodoItem()" style="width: 100%; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-purple));">➕ Добавить задачу</button>
          </div>
        </div>
      </div>
      <div class="card" style="padding: 16px; margin: 0 16px 12px;">
        <div style="font-size: 16px; font-weight: 700; color: var(--neon-orange); margin-bottom: 12px;">📝 Список заметок и задач</div>
        <div id="adminCalendarList"><div class="skeleton-list"><div class="skeleton-item"><div class="skeleton-lines"><div class="skeleton-line"></div></div></div></div></div>
      </div>
    `;
  }

  return `<div class="main-layout app-shell">
    <div class="header">
      <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
      <div class="header-title">Админка</div>
      <div></div>
    </div>
    <div class="hero-card page-hero glass-card" style="border-left: 4px solid var(--neon-orange);">
      <div>
        <div class="hero-title" style="color: var(--neon-orange);">Управление системой</div>
        <div class="hero-subtitle">Сводка по людям, сменам, синхронизации и рабочим данным.</div>
      </div>
    </div>
    ${tabsHtml}
    <div class="admin-sections" style="padding-bottom: 24px;">${contentHtml}</div>
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
    html += `<h4 style="margin-bottom: 10px; color: var(--neon-green); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">✓ Присутствуют (${data.shifts.length})</h4>`;
    data.shifts.forEach(s => {
      const statusColor = s.status === 'on_time' ? 'var(--neon-green)' : 'var(--neon-orange)';
      const statusText = s.status === 'on_time' ? 'Вовремя' : 'Опоздание';
      html += `<div class="card" style="padding: 12px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid ${statusColor};">
        <div>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 14px;">${s.user_name}</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;"><span style="color: ${statusColor}; font-weight: 600;">${statusText}</span> <span style="color: var(--text-muted);">${s.start_time_yakutsk}</span></div>
        </div>
      </div>`;
    });
  }

  // Отсутствующие
  if (data.absent && data.absent.length > 0) {
    html += `<h4 style="margin: 16px 0 10px; color: var(--neon-red); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">✗ Отсутствуют (${data.absent.length})</h4>`;
    data.absent.forEach(u => {
      html += `<div class="card" style="padding: 12px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid var(--neon-red); opacity: 0.7;">
        <div>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 14px;">${u.user_name}</div>
          <div style="font-size: 12px; color: var(--neon-red); font-weight: 600; margin-top: 2px;">Не выход</div>
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

  container.innerHTML = '<div class="skeleton-list"><div class="skeleton-item"><div class="skeleton-lines"><div class="skeleton-line"></div></div></div></div>';

  const data = await apiGet(`/api/shift/history?startDate=${startDate}&endDate=${endDate}`);
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет данных за период</div>';
    return;
  }

  let html = '';
  data.forEach(s => {
    const statusColor = s.status === 'on_time' ? 'var(--neon-green)' : s.status === 'late' ? 'var(--neon-orange)' : 'var(--neon-red)';
    html += `<div class="card" style="padding: 12px 14px; margin-bottom: 8px; border-left: 3px solid ${statusColor};">
      <div>
        <div style="font-weight: 600; color: var(--text-primary); font-size: 14px;">${s.user_name}</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;"><span style="background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 6px; font-size: 11px; margin-right: 8px;">${s.date}</span> <span style="color: ${statusColor}; font-weight: 600;">${s.status_text}</span></div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${s.start_time_yakutsk || '-'}</div>
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
    html += `<h4 style="margin-bottom: 10px; color: var(--neon-cyan); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">📝 Заметки</h4>`;
    notes.forEach(n => {
      html += `<div class="card" style="padding: 12px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-start; border-left: 3px solid var(--neon-cyan);">
        <div style="flex: 1;">
          <div style="font-weight: 600; color: var(--text-primary); font-size: 14px;">${n.title}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;"><span style="background: rgba(6,182,212,0.15); color: var(--neon-cyan); padding: 2px 8px; border-radius: 6px; font-size: 11px;">${n.date}</span></div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">${n.text || ''}</div>
        </div>
        <button class="btn btn-small btn-secondary" style="min-width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; margin-left: 8px;" onclick="deleteCalendarNote(${n.id})" title="Удалить">🗑️</button>
      </div>`;
    });
  }

  // Задачи
  if (todos && todos.length > 0) {
    html += `<h4 style="margin: 16px 0 10px; color: var(--neon-green); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">✓ Задачи</h4>`;
    todos.forEach(t => {
      const status = t.is_completed ? `<span style="color: var(--neon-green); font-weight: 600;">✓ ${t.completed_by_name || ''}</span>` : '<span style="color: var(--neon-orange); font-weight: 600;">⏳ В процессе</span>';
      html += `<div class="card" style="padding: 12px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-start; border-left: 3px solid ${t.is_completed ? 'var(--neon-green)' : 'var(--neon-orange)'}">
        <div style="flex: 1;">
          <div style="font-weight: 600; color: var(--text-primary); font-size: 14px;">${t.title}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;"><span style="background: ${t.is_completed ? 'rgba(34,197,94,0.15)' : 'rgba(249,115,22,0.15)'}; color: ${t.is_completed ? 'var(--neon-green)' : 'var(--neon-orange)'}; padding: 2px 8px; border-radius: 6px; font-size: 11px;">${t.date}</span> ${status}</div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">${t.description || ''}</div>
        </div>
        <button class="btn btn-small btn-secondary" style="min-width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; margin-left: 8px;" onclick="deleteTodoItem(${t.id})" title="Удалить">🗑️</button>
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
    <button class="btn btn-primary" onclick="showAddUserForm()" style="margin-bottom: 16px; width: 100%; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-purple));">➕ Добавить пользователя</button>
    <div id="userFormContainer"></div>
    <div class="users-list" style="display: flex; flex-direction: column; gap: 8px;">
      ${users.map(u => `
        <div class="card" id="user-${u.id}" style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid ${u.role === 'admin' ? 'var(--neon-orange)' : 'var(--neon-cyan)'};">
          <div style="flex: 1;">
            <div style="font-weight: 600; color: var(--text-primary); font-size: 15px;">${u.login}</div>
            <div style="display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap;">
              <span class="badge ${u.role === 'admin' ? 'badge-orange' : 'badge-cyan'}">${u.role === 'admin' ? '👑 Админ' : '👤 Сотрудник'}</span>
              <span class="badge ${u.is_active ? 'badge-green' : 'badge-red'}">${u.is_active ? '✓ Активен' : '✗ Отключен'}</span>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
              <small>Создан: ${new Date(u.created_at).toLocaleDateString('ru-RU')}</small>
              ${u.last_login_at ? `<small> | Посл. вход: ${new Date(u.last_login_at).toLocaleString('ru-RU')}</small>` : ''}
            </div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-small btn-secondary" style="min-width: 36px; height: 36px; padding: 0; display: flex; align-items: center; justify-content: center;" onclick="editUser(${u.id}, '${u.login}', '${u.role}', ${u.is_active})" title="Редактировать">✏️</button>
            ${u.id !== currentUser.id ? `<button class="btn btn-small btn-danger" style="min-width: 36px; height: 36px; padding: 0; display: flex; align-items: center; justify-content: center;" onclick="deleteUser(${u.id})" title="Удалить">🗑️</button>` : ''}
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
    <div class="card" style="padding: 16px; margin-bottom: 16px;">
      <h4 style="color: var(--neon-cyan); margin-bottom: 12px; font-size: 16px;">Новый пользователь</h4>
      <input type="text" id="newUserLogin" class="form-input" placeholder="Логин" required style="margin-bottom: 8px; width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 10px; padding: 10px 12px;">
      <input type="password" id="newUserPassword" class="form-input" placeholder="Пароль" required style="margin-bottom: 8px; width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 10px; padding: 10px 12px;">
      <select id="newUserRole" class="form-input" style="margin-bottom: 12px; width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 10px; padding: 10px 12px;">
        <option value="staff">👤 Сотрудник</option>
        <option value="admin">👑 Администратор</option>
      </select>
      <div style="display: flex; gap: 10px;">
        <button class="btn btn-secondary" style="flex: 1;" onclick="document.getElementById('userFormContainer').innerHTML=''">Отмена</button>
        <button class="btn btn-primary" style="flex: 1; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-purple));" onclick="addUser()">Создать</button>
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
    <div class="card" style="padding: 16px; margin-bottom: 16px;">
      <h4 style="color: var(--neon-cyan); margin-bottom: 12px; font-size: 16px;">Редактировать: ${login}</h4>
      <input type="text" id="editLogin-${id}" class="form-input" value="${login}" placeholder="Логин" style="margin-bottom: 8px; width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 10px; padding: 10px 12px;">
      <input type="password" id="editPassword-${id}" class="form-input" placeholder="Новый пароль (оставьте пустым чтобы не менять)" style="margin-bottom: 8px; width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 10px; padding: 10px 12px;">
      <select id="editRole-${id}" class="form-input" style="margin-bottom: 8px; width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); border-radius: 10px; padding: 10px 12px;">
        <option value="staff" ${role === 'staff' ? 'selected' : ''}>👤 Сотрудник</option>
        <option value="admin" ${role === 'admin' ? 'selected' : ''}>👑 Администратор</option>
      </select>
      <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--text-primary); font-size: 14px; cursor: pointer;">
        <input type="checkbox" id="editActive-${id}" ${isActive ? 'checked' : ''} style="accent-color: var(--neon-cyan); width: 18px; height: 18px;">
        Активен
      </label>
      <div style="display: flex; gap: 10px;">
        <button class="btn btn-secondary" style="flex: 1;" onclick="document.getElementById('edit-form-${id}').style.display='none'">Отмена</button>
        <button class="btn btn-primary" style="flex: 1; background: linear-gradient(135deg, var(--neon-cyan), var(--neon-purple));" onclick="saveUser(${id})">Сохранить</button>
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
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${locks.map(l => `
        <div class="card" style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid var(--neon-red);">
          <div style="flex: 1;">
            <div style="font-weight: 600; color: var(--text-primary); font-size: 14px;">${l.category_name}</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Страница ${l.page_number} | Заблокировано: ${l.locked_by_name}</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;"><small>${new Date(l.locked_at).toLocaleString('ru-RU')}</small></div>
          </div>
          <button class="btn btn-small btn-secondary" onclick="forceUnlock(${l.category_id}, ${l.page_number})" style="margin-left: 8px;">Разблокировать</button>
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
