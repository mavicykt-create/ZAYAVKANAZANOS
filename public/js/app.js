// ZAN 1.1 - Main Application
const API_URL = '';

// State
let currentUser = null;
let currentView = 'login';
let appState = {
  categories: [],
  products: {},
  carryRequests: {},
  priceCheckPages: {},
  calendarItems: []
};

let currentCategoryId = null;
let currentCategoryName = '';
let currentProducts = [];
let carryQuantities = {};
let currentPageNumber = null;
let collectedIds = new Set();

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
    case 'price-check-pages': app.innerHTML = renderPriceCheckPages(); break;
    case 'price-check-products': app.innerHTML = renderPriceCheckProducts(); break;
    case 'product-check': app.innerHTML = renderProductCheck(); break;
    case 'calendar': app.innerHTML = renderCalendar(); break;
    case 'admin': app.innerHTML = renderAdmin(); break;
  }
}

// Login View
function renderLogin() {
  return `<div class="login-screen">
    <div class="login-logo">ZAN 1.1</div>
    <div class="login-subtitle">Вход в систему</div>
    <form class="login-form" onsubmit="handleLogin(event)">
      <input type="text" class="login-input" id="login" placeholder="Логин" required>
      <input type="password" class="login-input" id="password" placeholder="Пароль" required>
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
        <span>${currentUser.login}</span>
        <button class="logout-btn" onclick="handleLogout()">Выход</button>
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
    <button class="install-btn" id="installBtn" style="display:none" onclick="installApp()">Установить на мобильный</button>
  </div>`;
}

function showMainMenu() { currentView = 'menu'; renderApp(); checkInstallPrompt(); }
async function handleLogout() { await apiPost('/api/auth/logout', {}); currentUser = null; showLogin(); }

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; const btn = document.getElementById('installBtn'); if (btn) btn.style.display = 'block'; });
async function installApp() { if (!deferredPrompt) return; deferredPrompt.prompt(); const result = await deferredPrompt.userChoice; if (result.outcome === 'accepted') { document.getElementById('installBtn').style.display = 'none'; } deferredPrompt = null; }
function checkInstallPrompt() { if (deferredPrompt) { const btn = document.getElementById('installBtn'); if (btn) btn.style.display = 'block'; } }

// Carry Categories
async function showCarryCategories() {
  currentView = 'carry-categories'; renderApp();
  const categories = await apiGet('/api/catalog/categories');
  appState.categories = categories;
  const list = document.getElementById('categoriesList');
  if (list) { list.innerHTML = categories.map(c => `<div class="category-item" onclick="showCarryProducts(${c.id}, '${c.name}')"><span class="category-name">${c.name}</span><span class="category-arrow">→</span></div>`).join(''); }
}

function renderCarryCategories() {
  const totalQty = Object.values(carryQuantities).reduce((a,b) => a+b, 0);
  return `<div class="main-layout">
    <div class="header"><button class="back-btn" onclick="showMainMenu()">← Назад</button><div class="header-title">Заявка на занос</div><div></div></div>
    <div class="categories-list" id="categoriesList"><div class="loading">Загрузка...</div></div>
    <div style="height: 80px;"></div>
    <div class="bottom-actions"><button class="btn btn-secondary" onclick="showCarryAssembly()">Сборка (${totalQty})</button></div>
  </div>`;
}

// Carry Products
async function showCarryProducts(categoryId, categoryName) {
  currentCategoryId = categoryId; currentCategoryName = categoryName; currentView = 'carry-products'; renderApp();
  document.getElementById('categoryTitle').textContent = categoryName;
  const products = await apiGet(`/api/catalog/products/${categoryId}`);
  currentProducts = products; renderProductGrid();
}

function renderCarryProducts() {
  return `<div class="main-layout">
    <div class="header"><button class="back-btn" onclick="showCarryCategories()">← Назад</button><div class="header-title" id="categoryTitle">Категория</div><div></div></div>
    <div class="products-grid" id="productsGrid"></div>
    <div style="height: 80px;"></div>
    <div class="bottom-actions"><button class="btn btn-primary" onclick="confirmCategory()">Подтвердить заявку</button></div>
  </div>`;
}

function renderProductGrid() {
  const grid = document.getElementById('productsGrid'); if (!grid) return;
  grid.innerHTML = currentProducts.map(p => {
    const qty = carryQuantities[p.id] || 0;
    const step = p.name.includes('1/') ? 5 : 1;
    return `<div class="product-card" onclick="addToCarry(${p.id}, ${step})">
      <img src="${p.picture || '/icons/icon-192x192.png'}" class="product-image" loading="lazy">
      ${qty > 0 ? `<div class="product-qty" onclick="event.stopPropagation(); removeFromCarry(${p.id}, ${step})">${qty}</div>` : ''}
      <div class="product-info"><div class="product-name">${p.name}</div><div class="product-code">${p.vendor_code || ''}</div></div>
    </div>`;
  }).join('');
}

function addToCarry(productId, step) {
  carryQuantities[productId] = (carryQuantities[productId] || 0) + step;
  apiPost('/api/carry/request', { categoryId: currentCategoryId, productId: productId, quantity: carryQuantities[productId] });
  renderProductGrid();
}

function removeFromCarry(productId, step) {
  carryQuantities[productId] = Math.max(0, (carryQuantities[productId] || 0) - step);
  apiPost('/api/carry/request', { categoryId: currentCategoryId, productId: productId, quantity: carryQuantities[productId] });
  if (carryQuantities[productId] === 0) delete carryQuantities[productId];
  renderProductGrid();
}

async function confirmCategory() {
  const hasItems = Object.values(carryQuantities).some(q => q > 0);
  if (!hasItems) { alert('Выберите товары'); return; }
  await apiPost('/api/carry/complete-category', { categoryId: currentCategoryId });
  currentProducts.forEach(p => delete carryQuantities[p.id]);
  alert('Заявка подтверждена'); showCarryCategories();
}

// Carry Assembly
async function showCarryAssembly() { currentView = 'carry-assembly'; renderApp(); const items = await apiGet('/api/carry/assembly'); renderAssemblyList(items); }
function renderCarryAssembly() { return `<div class="main-layout"><div class="header"><button class="back-btn" onclick="showCarryCategories()">← Назад</button><div class="header-title">Сборка</div><div></div></div><div id="assemblyList"></div><div style="height: 80px;"></div><div class="bottom-actions"><button class="btn btn-primary" onclick="completeOrder()">Заявка собрана</button></div></div>`; }

function renderAssemblyList(items) {
  const container = document.getElementById('assemblyList'); if (!container) return;
  if (items.length === 0) { container.innerHTML = '<div class="empty-state">Нет товаров в сборке</div>'; return; }
  container.innerHTML = items.map(item => `<div class="assembly-item"><div class="assembly-checkbox" id="cb-${item.id}" onclick="toggleCollected(${item.id})"></div><div class="assembly-content"><div>${item.product_name}</div><div class="product-code">${item.vendor_code || ''}</div></div><div class="assembly-qty">${item.quantity}</div></div>`).join('');
}

function toggleCollected(requestId) {
  const cb = document.getElementById(`cb-${requestId}`);
  if (collectedIds.has(requestId)) { collectedIds.delete(requestId); cb.classList.remove('checked'); cb.innerHTML = ''; }
  else { collectedIds.add(requestId); cb.classList.add('checked'); cb.innerHTML = '✓'; }
}

async function completeOrder() {
  if (collectedIds.size === 0) { alert('Отметьте собранные товары'); return; }
  await apiPost('/api/carry/mark-collected', { requestIds: Array.from(collectedIds) });
  await apiPost('/api/carry/complete-order', {});
  collectedIds.clear(); alert('Сборка завершена'); showMainMenu();
}

// Price Check
async function showPriceCheckCategories() { currentView = 'price-check-categories'; renderApp(); const categories = await apiGet('/api/catalog/categories'); const list = document.getElementById('pcCategoriesList'); if (list) list.innerHTML = categories.map(c => `<div class="category-item" onclick="showPriceCheckPages(${c.id}, '${c.name}')"><span class="category-name">${c.name}</span><span class="category-arrow">→</span></div>`).join(''); }
function renderPriceCheckCategories() { return `<div class="main-layout"><div class="header"><button class="back-btn" onclick="showMainMenu()">← Назад</button><div class="header-title">Проверка ценников</div><div></div></div><div class="categories-list" id="pcCategoriesList"><div class="loading">Загрузка...</div></div></div>`; }

async function showPriceCheckPages(categoryId, categoryName) {
  currentCategoryId = categoryId; currentCategoryName = categoryName; currentView = 'price-check-pages'; renderApp();
  document.getElementById('pcCategoryTitle').textContent = categoryName;
  const data = await apiGet(`/api/price-check/pages/${categoryId}`);
  const grid = document.getElementById('pagesGrid');
  if (grid) {
    grid.innerHTML = data.pages.map(p => `<div class="page-item ${p.isLocked ? 'locked' : ''} ${p.lockedById === currentUser.id ? 'active' : ''}" onclick="${p.isLocked ? '' : `openPriceCheckPage(${p.pageNumber})`}"><div class="page-number">Стр. ${p.pageNumber}</div><div class="page-status">${p.lockedBy ? 'Занято: ' + p.lockedBy : 'Свободно'}</div></div>`).join('');
  }
}

function renderPriceCheckPages() { return `<div class="main-layout"><div class="header"><button class="back-btn" onclick="showPriceCheckCategories()">← Назад</button><div class="header-title" id="pcCategoryTitle">Категория</div><div></div></div><div class="pages-grid" id="pagesGrid"></div></div>`; }

async function openPriceCheckPage(pageNumber) {
  await apiPost('/api/price-check/lock-page', { categoryId: currentCategoryId, pageNumber });
  currentPageNumber = pageNumber; currentView = 'price-check-products'; renderApp();
  document.getElementById('pcPageTitle').textContent = `${currentCategoryName} - Стр. ${pageNumber}`;
  const products = await apiGet(`/api/price-check/products/${currentCategoryId}/${pageNumber}`);
  const list = document.getElementById('pcProductsList');
  if (list) list.innerHTML = products.map(p => `<div class="pc-product"><img src="${p.picture || '/icons/icon-192x192.png'}" class="pc-product-image"><div class="pc-product-info"><div class="pc-product-name">${p.name}</div><div class="pc-product-code">${p.vendor_code || ''}</div><div class="pc-product-actions"><button class="pc-btn problem ${p.has_problem ? 'active' : ''}" onclick="toggleProblem(${p.id})">Проблема</button><button class="pc-btn price ${p.price_checked ? 'active' : ''}" onclick="togglePrice(${p.id})">Ценник</button></div></div></div>`).join('');
}

function renderPriceCheckProducts() { return `<div class="main-layout"><div class="header"><button class="back-btn" onclick="closePriceCheckPage()">← Назад</button><div class="header-title" id="pcPageTitle">Страница</div><div></div></div><div id="pcProductsList" style="padding: 16px;"></div></div>`; }

async function closePriceCheckPage() { await apiPost('/api/price-check/unlock-page', { categoryId: currentCategoryId, pageNumber: currentPageNumber }); showPriceCheckPages(currentCategoryId, currentCategoryName); }
async function toggleProblem(productId) { await apiPost('/api/price-check/toggle-problem', { categoryId: currentCategoryId, pageNumber: currentPageNumber, productId }); openPriceCheckPage(currentPageNumber); }
async function togglePrice(productId) { await apiPost('/api/price-check/toggle-price', { categoryId: currentCategoryId, pageNumber: currentPageNumber, productId }); openPriceCheckPage(currentPageNumber); }

// Product Check
async function showProductCheck() { currentView = 'product-check'; renderApp(); const products = await apiGet('/api/product-check/missing-barcodes'); const list = document.getElementById('pcMissingList'); if (list) { if (products.length === 0) { list.innerHTML = '<div class="empty-state">Все товары имеют штрих-коды</div>'; } else { list.innerHTML = products.map(p => `<div class="assembly-item"><div class="assembly-content"><div>${p.name}</div><div class="product-code">${p.category_name} | ${p.vendor_code || ''}</div></div><button class="icon-btn" onclick="hideProduct(${p.id})">✕</button></div>`).join(''); } } }
function renderProductCheck() { return `<div class="main-layout"><div class="header"><button class="back-btn" onclick="showMainMenu()">← Назад</button><div class="header-title">Проверка товара</div><div></div></div><div id="pcMissingList" style="padding: 16px;"><div class="loading">Загрузка...</div></div></div>`; }
async function hideProduct(productId) { await apiPost('/api/product-check/hide', { productId }); showProductCheck(); }

// Calendar
function renderCalendar() {
  const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const today = new Date();
  const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - today.getDay() + 1);
  let html = `<div class="main-layout"><div class="header"><button class="back-btn" onclick="showMainMenu()">← Назад</button><div class="header-title">Календарь</div><div></div></div><div class="calendar-grid">`;
  for (let i = 0; i < 7; i++) { const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i); const isToday = d.toDateString() === today.toDateString(); html += `<div class="calendar-day ${isToday ? 'active' : ''}"><span class="calendar-day-name">${days[i]}</span><span class="calendar-day-number">${d.getDate()}</span></div>`; }
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
async function showAdmin() { currentView = 'admin'; renderApp(); loadAdminOverview(); }
async function loadAdminOverview() {
  const data = await apiGet('/api/admin/overview');
  const container = document.getElementById('adminOverview');
  if (container && data) {
    container.innerHTML = `<div class="stat-row"><span class="stat-label">Сотрудники онлайн</span><span class="stat-value">${data.onlineUsers}</span></div>
    <div class="stat-row"><span class="stat-label">Товаров в каталоге</span><span class="stat-value">${data.totalProducts}</span></div>
    <div class="stat-row"><span class="stat-label">Без штрих-кода</span><span class="stat-value">${data.missingBarcodes}</span></div>
    <div class="stat-row"><span class="stat-label">Статус синхронизации</span><span class="stat-value">${data.syncStatus?.status || 'idle'}</span></div>`;
  }
}

function renderAdmin() {
  return `<div class="main-layout"><div class="header"><button class="back-btn" onclick="showMainMenu()">← Назад</button><div class="header-title">Админка</div><div></div></div>
    <div class="admin-sections">
      <div class="admin-card"><div class="admin-card-title">📊 Обзор</div><div id="adminOverview"><div class="loading">Загрузка...</div></div></div>
      <div class="admin-card"><div class="admin-card-title">🔄 Синхронизация</div>
        <button class="btn btn-primary" onclick="startSync()" style="margin-bottom: 8px;">Обновить каталог</button>
        <button class="btn btn-secondary" onclick="resetSync()">Сбросить обновление</button>
      </div>
    </div>
  </div>`;
}

async function startSync() { await apiPost('/api/sync/start', {}); alert('Синхронизация запущена'); loadAdminOverview(); }
async function resetSync() { await apiPost('/api/sync/reset', {}); alert('Синхронизация сброшена'); loadAdminOverview(); }

// Init on load
document.addEventListener('DOMContentLoaded', init);
