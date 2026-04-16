/**
 * ZAN 1.1 - Main Application
 * Modern iOS-style Warehouse Management System
 */

const API_URL = '';

// ============================================
// STATE MANAGEMENT
// ============================================
const state = {
  currentUser: null,
  currentView: 'login',
  currentCategoryId: null,
  currentCategoryName: '',
  currentProducts: [],
  currentPageNumber: null,
  collectedIds: new Set(),
  quantities: {},
  deferredPrompt: null,
  isLoading: false
};

// ============================================
// API HELPERS
// ============================================
async function apiGet(endpoint) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, { 
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('API GET Error:', e);
    showToast('Ошибка соединения', 'error');
    return null;
  }
}

async function apiPost(endpoint, data) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    console.error('API POST Error:', e);
    showToast(e.message || 'Ошибка запроса', 'error');
    return { error: e.message };
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function getImageUrl(picture) {
  if (!picture) return '/icons/icon-192x192.png';
  if (picture.startsWith('http')) return picture;
  if (picture.startsWith('/')) return picture;
  return '/icons/icon-192x192.png';
}

function formatDate(date) {
  return new Date(date).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function debounce(fn, ms) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

// ============================================
// INITIALIZATION
// ============================================
async function init() {
  // Check for existing session
  const user = await apiGet('/api/auth/me');
  if (user) {
    state.currentUser = user;
    showMainMenu();
  } else {
    showLogin();
  }
  
  // Setup install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    updateInstallButton();
  });
}

// ============================================
// VIEW RENDERING
// ============================================
function renderApp() {
  const app = document.getElementById('app');
  if (!app) return;
  
  const views = {
    'login': renderLogin,
    'menu': renderMainMenu,
    'carry-categories': renderCarryCategories,
    'carry-products': renderCarryProducts,
    'carry-assembly': renderCarryAssembly,
    'price-check-categories': renderPriceCheckCategories,
    'price-check-pages': renderPriceCheckPages,
    'price-check-products': renderPriceCheckProducts,
    'product-check': renderProductCheck,
    'calendar': renderCalendar,
    'admin': renderAdmin,
    'print': renderPrint
  };
  
  const renderFn = views[state.currentView];
  if (renderFn) {
    app.innerHTML = renderFn();
    
    // Trigger animations after render
    requestAnimationFrame(() => {
      document.querySelectorAll('.menu-item, .product-card, .list-item').forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        setTimeout(() => {
          el.style.transition = 'all 0.3s ease-out';
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, i * 30);
      });
    });
  }
}

// ============================================
// LOGIN VIEW
// ============================================
function renderLogin() {
  return `
    <div class="login-screen">
      <div class="login-logo">ZAN 1.1</div>
      <div class="login-version">Система управления складом</div>
      <form class="login-form" onsubmit="handleLogin(event)">
        <div class="login-input-group">
          <input 
            type="text" 
            class="login-input" 
            id="login" 
            placeholder="Логин" 
            required 
            autocomplete="username"
            autofocus
          >
          <input 
            type="password" 
            class="login-input" 
            id="password" 
            placeholder="Пароль" 
            required 
            autocomplete="current-password"
          >
        </div>
        <button type="submit" class="login-btn" id="loginBtn">Войти</button>
      </form>
    </div>
  `;
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const login = document.getElementById('login').value.trim();
  const password = document.getElementById('password').value;
  
  btn.disabled = true;
  btn.textContent = 'Вход...';
  
  const result = await apiPost('/api/auth/login', { login, password });
  
  btn.disabled = false;
  btn.textContent = 'Войти';
  
  if (result.error) {
    showToast('Неверный логин или пароль', 'error');
    return;
  }
  
  state.currentUser = result;
  showToast(`Добро пожаловать, ${result.login}!`, 'success');
  showMainMenu();
}

function showLogin() {
  state.currentView = 'login';
  renderApp();
}

// ============================================
// MAIN MENU
// ============================================
function renderMainMenu() {
  const isAdmin = state.currentUser?.role === 'admin';
  
  return `
    <div class="main-layout">
      <header class="header">
        <div class="header-left"></div>
        <h1 class="header-title">ZAN 1.1</h1>
        <div class="header-right">
          <span style="color: var(--ios-gray); font-size: 15px; margin-right: 8px;">${state.currentUser?.login || ''}</span>
          <button class="logout-btn" onclick="handleLogout()">Выйти</button>
        </div>
      </header>
      
      <div class="menu-grid">
        <div class="menu-item primary" onclick="showCarryCategories()">
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
        ${isAdmin ? `
        <div class="menu-item success" onclick="showAdmin()">
          <div class="menu-icon">⚙️</div>
          <div class="menu-label">Админка</div>
        </div>
        ` : ''}
      </div>
      
      <button class="install-btn" id="installBtn" style="display:none" onclick="installApp()">
        📲 Установить приложение
      </button>
    </div>
  `;
}

function showMainMenu() {
  state.currentView = 'menu';
  renderApp();
  updateInstallButton();
}

async function handleLogout() {
  await apiPost('/api/auth/logout', {});
  state.currentUser = null;
  showToast('Вы вышли из системы');
  showLogin();
}

function updateInstallButton() {
  const btn = document.getElementById('installBtn');
  if (btn && state.deferredPrompt) {
    btn.style.display = 'block';
  }
}

async function installApp() {
  if (!state.deferredPrompt) return;
  
  state.deferredPrompt.prompt();
  const result = await state.deferredPrompt.userChoice;
  
  if (result.outcome === 'accepted') {
    showToast('Приложение установлено!', 'success');
    const btn = document.getElementById('installBtn');
    if (btn) btn.style.display = 'none';
  }
  
  state.deferredPrompt = null;
}

// ============================================
// CARRY CATEGORIES
// ============================================
async function showCarryCategories() {
  state.currentView = 'carry-categories';
  renderApp();
  
  const categories = await apiGet('/api/catalog/categories');
  const list = document.getElementById('categoriesList');
  
  if (list && categories) {
    if (categories.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-title">Нет категорий</div>
          <div class="empty-text">Категории не найдены в базе данных</div>
        </div>
      `;
      return;
    }
    
    list.innerHTML = `
      <div class="list-group">
        ${categories.map(c => `
          <div class="list-item" onclick="showCarryProducts(${c.id}, '${escapeHtml(c.name)}')">
            <span class="list-item-title">${escapeHtml(c.name)}</span>
            <span class="list-item-arrow">›</span>
          </div>
        `).join('')}
      </div>
    `;
  }
}

function renderCarryCategories() {
  return `
    <div class="main-layout">
      <header class="header">
        <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
        <h1 class="header-title">Заявка на занос</h1>
        <div class="header-right"></div>
      </header>
      
      <div class="list-container" id="categoriesList">
        <div class="loading" style="text-align:center;padding:40px;color:var(--ios-gray)">
          <div class="loading-spinner" style="margin:0 auto 16px"></div>
          Загрузка категорий...
        </div>
      </div>
      
      <div class="bottom-actions">
        <button class="btn btn-secondary" onclick="showCarryAssembly()">
          🛒 Сборка
        </button>
      </div>
    </div>
  `;
}

// ============================================
// CARRY PRODUCTS
// ============================================
async function showCarryProducts(categoryId, categoryName) {
  state.currentCategoryId = categoryId;
  state.currentCategoryName = categoryName;
  state.currentView = 'carry-products';
  renderApp();
  
  document.getElementById('categoryTitle').textContent = categoryName;
  
  // Load products
  const products = await apiGet(`/api/catalog/products/${categoryId}`);
  state.currentProducts = products || [];
  
  // Load current quantities
  const requests = await apiGet('/api/carry/requests');
  state.quantities = {};
  
  if (requests) {
    requests.forEach(r => {
      if (r.category_id === categoryId) {
        state.quantities[r.product_id] = r.quantity;
      }
    });
  }
  
  renderProductGrid();
}

function renderCarryProducts() {
  return `
    <div class="main-layout">
      <header class="header">
        <button class="back-btn" onclick="showCarryCategories()">‹ Назад</button>
        <h1 class="header-title" id="categoryTitle">Категория</h1>
        <div class="header-right"></div>
      </header>
      
      <div class="products-grid" id="productsGrid"></div>
      
      <div class="bottom-actions">
        <button class="btn btn-secondary" onclick="printCategory()">🖨️ Печать</button>
        <button class="btn btn-primary" onclick="confirmCategory()">✓ Готово</button>
      </div>
    </div>
  `;
}

function renderProductGrid() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;
  
  if (state.currentProducts.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-icon">📭</div>
        <div class="empty-title">Нет товаров</div>
        <div class="empty-text">В этой категории пока нет товаров</div>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = state.currentProducts.map(p => {
    const qty = state.quantities[p.id] || 0;
    const step = p.name.includes('1/') ? 5 : 1;
    const imgUrl = getImageUrl(p.picture);
    
    return `
      <div class="product-card" onclick="addToCarry(${p.id}, ${step})">
        <div class="product-image-wrapper">
          <img src="${imgUrl}" class="product-image" loading="lazy" 
               onerror="this.parentElement.innerHTML='<div class=\\'product-image-placeholder\\'>📦</div>'">
          ${qty > 0 ? `
            <div class="qty-control-area" onclick="event.stopPropagation(); removeFromCarry(${p.id}, ${step})"></div>
            <div class="product-qty-badge ${qty > 0 ? 'pulse' : ''}" onclick="event.stopPropagation(); removeFromCarry(${p.id}, ${step})">${qty}</div>
          ` : ''}
        </div>
        <div class="product-info">
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-code">${p.vendor_code || ''}</div>
        </div>
      </div>
    `;
  }).join('');
  
  // Remove pulse animation after it plays
  setTimeout(() => {
    document.querySelectorAll('.product-qty-badge').forEach(el => {
      el.classList.remove('pulse');
    });
  }, 300);
}

async function addToCarry(productId, step) {
  state.quantities[productId] = (state.quantities[productId] || 0) + step;
  
  const result = await apiPost('/api/carry/request', {
    categoryId: state.currentCategoryId,
    productId: productId,
    quantity: state.quantities[productId]
  });
  
  if (!result.error) {
    renderProductGrid();
    // Haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(10);
  }
}

async function removeFromCarry(productId, step) {
  state.quantities[productId] = Math.max(0, (state.quantities[productId] || 0) - step);
  
  const result = await apiPost('/api/carry/request', {
    categoryId: state.currentCategoryId,
    productId: productId,
    quantity: state.quantities[productId]
  });
  
  if (!result.error) {
    if (state.quantities[productId] === 0) {
      delete state.quantities[productId];
    }
    renderProductGrid();
    if (navigator.vibrate) navigator.vibrate(20);
  }
}

async function confirmCategory() {
  const hasItems = Object.values(state.quantities).some(q => q > 0);
  if (!hasItems) {
    showToast('Выберите товары', 'error');
    return;
  }
  
  const result = await apiPost('/api/carry/complete-category', {
    categoryId: state.currentCategoryId
  });
  
  if (!result.error) {
    state.quantities = {};
    showToast('Заявка подтверждена!', 'success');
    showCarryCategories();
  }
}

// ============================================
// PRINT
// ============================================
async function printCategory() {
  const data = await apiGet(`/api/carry/print/${state.currentCategoryId}`);
  if (!data?.items?.length) {
    showToast('Нет товаров для печати', 'error');
    return;
  }
  
  window.printData = data;
  state.currentView = 'print';
  renderApp();
}

async function printAssembly() {
  const data = await apiGet('/api/carry/print-all');
  if (!data?.items?.length) {
    showToast('Нет товаров для печати', 'error');
    return;
  }
  
  window.printData = data;
  state.currentView = 'print';
  renderApp();
}

function renderPrint() {
  const data = window.printData || { date: '', category: '', items: [] };
  const isAssembly = !data.category;
  
  return `
    <div class="main-layout">
      <header class="header">
        <button class="back-btn" onclick="${isAssembly ? 'showCarryAssembly()' : `showCarryProducts(${state.currentCategoryId}, '${state.currentCategoryName}')`}">‹ Назад</button>
        <h1 class="header-title">Печать</h1>
        <div class="header-right">
          <button class="btn btn-primary" onclick="window.print()" style="padding:8px 16px;font-size:14px;">🖨️ Печать</button>
        </div>
      </header>
      
      <div class="print-content" style="padding:20px;background:white;color:black;">
        <h2 style="margin-bottom:5px;font-size:24px;">Заявка на занос</h2>
        <p style="color:#666;margin-bottom:5px;">${data.date}</p>
        ${data.category ? `<p style="font-weight:bold;margin-bottom:20px;font-size:18px;">${data.category}</p>` : ''}
        
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="border-bottom:2px solid #333;">
              <th style="text-align:left;padding:8px;">№</th>
              <th style="text-align:left;padding:8px;">Товар</th>
              <th style="text-align:left;padding:8px;">Артикул</th>
              ${isAssembly ? '<th style="text-align:left;padding:8px;">Категория</th>' : ''}
              <th style="text-align:center;padding:8px;">Кол-во</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((item, i) => `
              <tr style="border-bottom:1px solid #ddd;">
                <td style="padding:8px;">${i + 1}</td>
                <td style="padding:8px;">${escapeHtml(item.name)}</td>
                <td style="padding:8px;color:#666;">${item.vendor_code || '-'}</td>
                ${isAssembly ? `<td style="padding:8px;color:#666;">${item.category_name || '-'}</td>` : ''}
                <td style="padding:8px;text-align:center;font-weight:bold;">${item.quantity}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================
// CARRY ASSEMBLY
// ============================================
async function showCarryAssembly() {
  state.currentView = 'carry-assembly';
  state.collectedIds.clear();
  renderApp();
  
  const items = await apiGet('/api/carry/assembly');
  renderAssemblyList(items);
}

function renderCarryAssembly() {
  return `
    <div class="main-layout">
      <header class="header">
        <button class="back-btn" onclick="showCarryCategories()">‹ Назад</button>
        <h1 class="header-title">Сборка</h1>
        <div class="header-right">
          <button class="btn btn-secondary" onclick="printAssembly()" style="padding:8px 16px;font-size:14px;">🖨️ Печать</button>
        </div>
      </header>
      
      <div class="assembly-list" id="assemblyList"></div>
      
      <div class="bottom-actions">
        <button class="btn btn-primary" onclick="completeOrder()">✓ Заявка собрана</button>
      </div>
    </div>
  `;
}

function renderAssemblyList(items) {
  const container = document.getElementById('assemblyList');
  if (!container) return;
  
  if (!items?.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛒</div>
        <div class="empty-title">Нет товаров в сборке</div>
        <div class="empty-text">Выберите товары в категориях</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = items.map(item => `
    <div class="assembly-item">
      <div class="assembly-checkbox ${state.collectedIds.has(item.id) ? 'checked' : ''}" 
           id="cb-${item.id}" 
           onclick="toggleCollected(${item.id})"></div>
      <div class="assembly-content">
        <div class="assembly-title">${escapeHtml(item.product_name)}</div>
        <div class="assembly-subtitle">${item.vendor_code || ''} | ${item.category_name}</div>
      </div>
      <div class="assembly-qty">${item.quantity}</div>
    </div>
  `).join('');
}

function toggleCollected(requestId) {
  const cb = document.getElementById(`cb-${requestId}`);
  if (state.collectedIds.has(requestId)) {
    state.collectedIds.delete(requestId);
    cb.classList.remove('checked');
  } else {
    state.collectedIds.add(requestId);
    cb.classList.add('checked');
    if (navigator.vibrate) navigator.vibrate(10);
  }
}

async function completeOrder() {
  if (state.collectedIds.size === 0) {
    showToast('Отметьте собранные товары', 'error');
    return;
  }
  
  await apiPost('/api/carry/mark-collected', {
    requestIds: Array.from(state.collectedIds)
  });
  
  await apiPost('/api/carry/complete-order', {});
  
  state.collectedIds.clear();
  showToast('Сборка завершена!', 'success');
  showMainMenu();
}

// ============================================
// PRICE CHECK
// ============================================
async function showPriceCheckCategories() {
  state.currentView = 'price-check-categories';
  renderApp();
  
  const categories = await apiGet('/api/catalog/categories');
  const list = document.getElementById('pcCategoriesList');
  
  if (list && categories) {
    list.innerHTML = `
      <div class="list-group">
        ${categories.map(c => `
          <div class="list-item" onclick="showPriceCheckPages(${c.id}, '${escapeHtml(c.name)}')">
            <span class="list-item-title">${escapeHtml(c.name)}</span>
            <span class="list-item-arrow">›</span>
          </div>
        `).join('')}
      </div>
    `;
  }
}

function renderPriceCheckCategories() {
  return `
    <div class="main-layout">
      <header class="header">
        <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
        <h1 class="header-title">Проверка ценников</h1>
        <div class="header-right"></div>
      </header>
      
      <div class="list-container" id="pcCategoriesList">
        <div class="loading" style="text-align:center;padding:40px;color:var(--ios-gray)">
          <div class="loading-spinner" style="margin:0 auto 16px"></div>
          Загрузка...
        </div>
      </div>
    </div>
  `;
}

async function showPriceCheckPages(categoryId, categoryName) {
  state.currentCategoryId = categoryId;
  state.currentCategoryName = categoryName;
  state.currentView = 'price-check-pages';
  renderApp();
  
  document.getElementById('pcCategoryTitle').textContent = categoryName;
  
  const data = await apiGet(`/api/price-check/pages/${categoryId}`);
  const grid = document.getElementById('pagesGrid');
  
  if (grid && data?.pages) {
    grid.innerHTML = data.pages.map(p => `
      <div class="page-item ${p.isLocked ? 'locked' : ''} ${p.lockedById === state.currentUser?.id ? 'active' : ''}" 
           onclick="${p.isLocked ? '' : `openPriceCheckPage(${p.pageNumber})`}">
        <div class="page-number">Стр. ${p.pageNumber}</div>
        <div class="page-status">${p.lockedBy ? 'Занято: ' + p.lockedBy : 'Свободно'}</div>
      </div>
    `).join('');
  }
}

function renderPriceCheckPages() {
  return `
    <div class="main-layout">
      <header class="header">
        <button class="back-btn" onclick="showPriceCheckCategories()">‹ Назад</button>
        <h1 class="header-title" id="pcCategoryTitle">Категория</h1>
        <div class="header-right"></div>
      </header>
      
      <div class="pages-grid" id="pagesGrid"></div>
    </div>
  `;
}

async function openPriceCheckPage(pageNumber) {
  await apiPost('/api/price-check/lock-page', {
    categoryId: state.currentCategoryId,
    pageNumber
  });
  
  state.currentPageNumber = pageNumber;
  state.currentView = 'price-check-products';
  renderApp();
  
  document.getElementById('pcPageTitle').textContent = `${state.currentCategoryName} - Стр. ${pageNumber}`;
  
  const products = await apiGet(`/api/price-check/products/${state.currentCategoryId}/${pageNumber}`);
  const list = document.getElementById('pcProductsList');
  
  if (list && products) {
    list.innerHTML = products.map(p => {
      const imgUrl = getImageUrl(p.picture);
      return `
        <div class="pc-product">
          <img src="${imgUrl}" class="pc-product-image" 
               onerror="this.src='/icons/icon-192x192.png'">
          <div class="pc-product-info">
            <div class="pc-product-name">${escapeHtml(p.name)}</div>
            <div class="pc-product-code">${p.vendor_code || ''}</div>
            <div class="pc-product-actions">
              <button class="pc-btn problem ${p.has_problem ? 'active' : ''}" onclick="toggleProblem(${p.id})">
                ${p.has_problem ? '✓ ' : ''}Проблема
              </button>
              <button class="pc-btn price ${p.price_checked ? 'active' : ''}" onclick="togglePrice(${p.id})">
                ${p.price_checked ? '✓ ' : ''}Ценник
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

function renderPriceCheckProducts() {
  return `
    <div class="main-layout">
      <header class="header">
        <button class="back-btn" onclick="closePriceCheckPage()">‹ Назад</button>
        <h1 class="header-title" id="pcPageTitle">Страница</h1>
        <div class="header-right"></div>
      </header>
      
      <div class="pc-products-list" id="pcProductsList"></div>
    </div>
  `;
}

async function closePriceCheckPage() {
  await apiPost('/api/price-check/unlock-page', {
    categoryId: state.currentCategoryId,
    pageNumber: state.currentPageNumber
  });
  showPriceCheckPages(state.currentCategoryId, state.currentCategoryName);
}

async function toggleProblem(productId) {
  await apiPost('/api/price-check/toggle-problem', {
    categoryId: state.currentCategoryId,
    pageNumber: state.currentPageNumber,
    productId
  });
  openPriceCheckPage(state.currentPageNumber);
  if (navigator.vibrate) navigator.vibrate(10);
}

async function togglePrice(productId) {
  await apiPost('/api/price-check/toggle-price', {
    categoryId: state.currentCategoryId,
    pageNumber: state.currentPageNumber,
    productId
  });
  openPriceCheckPage(state.currentPageNumber);
  if (navigator.vibrate) navigator.vibrate(10);
}

// ============================================
// PRODUCT CHECK
// ============================================
async function showProductCheck() {
  state.currentView = 'product-check';
  renderApp();
  
  const products = await apiGet('/api/product-check/missing-barcodes');
  const list = document.getElementById('pcMissingList');
  
  if (list) {
    if (!products?.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✓</div>
          <div class="empty-title">Все товары имеют штрих-коды</div>
          <div class="empty-text">Отличная работа!</div>
        </div>
      `;
      return;
    }
    
    list.innerHTML = `
      <div class="list-group">
        ${products.map(p => `
          <div class="list-item">
            <div class="list-item-content">
              <span class="list-item-title">${escapeHtml(p.name)}</span>
              <span class="list-item-subtitle">${p.category_name} | ${p.vendor_code || ''}</span>
            </div>
            <button class="icon-btn" onclick="hideProduct(${p.id})" title="Скрыть">✕</button>
          </div>
        `).join('')}
      </div>
    `;
  }
}

function renderProductCheck() {
  return `
    <div class="main-layout">
      <header class="header">
        <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
        <h1 class="header-title">Проверка товара</h1>
        <div class="header-right"></div>
      </header>
      
      <div class="list-container" id="pcMissingList">
        <div class="loading" style="text-align:center;padding:40px;color:var(--ios-gray)">
          <div class="loading-spinner" style="margin:0 auto 16px"></div>
          Загрузка...
        </div>
      </div>
    </div>
  `;
}

async function hideProduct(productId) {
  await apiPost('/api/product-check/hide', { productId });
  showProductCheck();
  showToast('Товар скрыт');
}

// ============================================
// CALENDAR
// ============================================
function renderCalendar() {
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1);
  
  let calendarHtml = '<div class="calendar-grid">';
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const isToday = d.toDateString() === today.toDateString();
    
    calendarHtml += `
      <div class="calendar-day ${isToday ? 'active' : ''}">
        <span class="calendar-day-name">${days[i]}</span>
        <span class="calendar-day-number">${d.getDate()}</span>
      </div>
    `;
  }
  calendarHtml += '</div>';
  
  return `
    <div class="main-layout">
      <header class="header">
        <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
        <h1 class="header-title">Календарь</h1>
        <div class="header-right"></div>
      </header>
      
      ${calendarHtml}
      
      <div class="calendar-events" id="calendarEvents">
        <div class="empty-state">
          <div class="empty-icon">📅</div>
          <div class="empty-title">Нет событий</div>
          <div class="empty-text">На этой неделе нет запланированных событий</div>
        </div>
      </div>
    </div>
  `;
}

function showCalendar() {
  state.currentView = 'calendar';
  renderApp();
  loadCalendarEvents();
}

async function loadCalendarEvents() {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  
  const items = await apiGet(`/api/calendar/items?startDate=${startOfWeek.toISOString().split('T')[0]}&endDate=${endOfWeek.toISOString().split('T')[0]}`);
  
  const container = document.getElementById('calendarEvents');
  if (container && items?.length) {
    container.innerHTML = items.map(item => `
      <div class="event-item">
        <div class="event-title">${escapeHtml(item.title)}</div>
        <div class="event-text">${escapeHtml(item.text || '')}</div>
      </div>
    `).join('');
  }
}

// ============================================
// ADMIN
// ============================================
async function showAdmin() {
  state.currentView = 'admin';
  renderApp();
  loadAdminOverview();
}

async function loadAdminOverview() {
  const data = await apiGet('/api/admin/overview');
  const container = document.getElementById('adminOverview');
  
  if (container && data) {
    const syncStatus = data.syncStatus || {};
    const statusColors = {
      'completed': 'success',
      'running': 'info',
      'error': 'danger',
      'idle': 'warning'
    };
    const statusColor = statusColors[syncStatus.status] || 'warning';
    
    container.innerHTML = `
      <div class="stat-row">
        <span class="stat-label">Сотрудники онлайн</span>
        <span class="stat-value">${data.onlineUsers}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Товаров в каталоге</span>
        <span class="stat-value">${data.totalProducts}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Без штрих-кода</span>
        <span class="stat-value ${data.missingBarcodes > 0 ? 'warning' : 'success'}">${data.missingBarcodes}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Синхронизация</span>
        <span class="stat-value ${statusColor}">${syncStatus.status || 'idle'}</span>
      </div>
      ${syncStatus.progress !== undefined ? `
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${syncStatus.progress}%"></div>
          </div>
        </div>
      ` : ''}
      ${syncStatus.message ? `<div style="margin-top:8px;font-size:13px;color:var(--ios-gray)">${syncStatus.message}</div>` : ''}
    `;
  }
}

function renderAdmin() {
  return `
    <div class="main-layout">
      <header class="header">
        <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
        <h1 class="header-title">Админка</h1>
        <div class="header-right"></div>
      </header>
      
      <div class="admin-sections">
        <div class="admin-card">
          <div class="admin-card-title">Обзор системы</div>
          <div id="adminOverview">
            <div class="loading" style="text-align:center;padding:20px;color:var(--ios-gray)">
              <div class="loading-spinner" style="margin:0 auto 16px"></div>
              Загрузка...
            </div>
          </div>
        </div>
        
        <div class="admin-card">
          <div class="admin-card-title">Синхронизация</div>
          <button class="btn btn-primary" onclick="startSync()" style="margin-bottom:12px;width:100%;">
            🔄 Обновить каталог
          </button>
          <button class="btn btn-secondary" onclick="resetSync()" style="width:100%;">
            Сбросить обновление
          </button>
        </div>
      </div>
    </div>
  `;
}

async function startSync() {
  await apiPost('/api/sync/start', {});
  showToast('Синхронизация запущена');
  
  const interval = setInterval(async () => {
    await loadAdminOverview();
    const data = await apiGet('/api/admin/overview');
    if (data?.syncStatus?.status === 'completed' || data?.syncStatus?.status === 'error') {
      clearInterval(interval);
      if (data.syncStatus.status === 'completed') {
        showToast('Синхронизация завершена!', 'success');
      }
    }
  }, 3000);
}

async function resetSync() {
  await apiPost('/api/sync/reset', {});
  showToast('Синхронизация сброшена');
  loadAdminOverview();
}

// ============================================
// UTILITIES
// ============================================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// START APP
// ============================================
document.addEventListener('DOMContentLoaded', init);
