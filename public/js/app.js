// ZAN 1.1 - Main Application (Apple Design)
const API_URL = '';

// State
let currentUser = null;
let currentView = 'login';

let currentCategoryId = null;
let currentCategoryName = '';
let currentProducts = [];
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

// Image Helper
function getImageUrl(picture) {
  if (!picture) return '/icons/icon-192x192.png';
  if (picture.startsWith('http')) return picture;
  if (picture.startsWith('/')) return picture;
  return '/icons/icon-192x192.png';
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

// Carry Categories
async function showCarryCategories() {
  currentView = 'carry-categories'; renderApp();
  const categories = await apiGet('/api/catalog/categories');
  const list = document.getElementById('categoriesList');
  if (list) { list.innerHTML = categories.map(c => `<div class="category-item" onclick="showCarryProducts(${c.id}, '${c.name}')"><span class="category-name">${c.name}</span><span class="category-arrow">›</span></div>`).join(''); }
}

function renderCarryCategories() {
  return `<div class="main-layout">
    <div class="header"><button class="back-btn" onclick="showMainMenu()">‹ Назад</button><div class="header-title">Заявка на занос</div><div></div></div>
    <div class="categories-list" id="categoriesList"><div class="loading">Загрузка...</div></div>
    <div style="height: 80px;"></div>
    <div class="bottom-actions"><button class="btn btn-secondary" onclick="showCarryAssembly()">🛒 Сборка</button></div>
  </div>`;
}

// Carry Products
async function showCarryProducts(categoryId, categoryName) {
  currentCategoryId = categoryId; currentCategoryName = categoryName; currentView = 'carry-products'; renderApp();
  document.getElementById('categoryTitle').textContent = categoryName;
  const products = await apiGet(`/api/catalog/products/${categoryId}`);
  currentProducts = products; 
  // Загружаем текущие количества из БД
  const requests = await apiGet('/api/carry/requests');
  window.currentQuantities = {};
  requests.forEach(r => {
    if (r.category_id === categoryId) {
      window.currentQuantities[r.product_id] = r.quantity;
    }
  });
  renderProductGrid();
}

function renderCarryProducts() {
  return `<div class="main-layout">
    <div class="header"><button class="back-btn" onclick="showCarryCategories()">‹ Назад</button><div class="header-title" id="categoryTitle">Категория</div><div></div></div>
    <div class="products-grid" id="productsGrid"></div>
    <div style="height: 80px;"></div>
    <div class="bottom-actions">
      <button class="btn btn-secondary" onclick="printCategory()">🖨️ Печать</button>
      <button class="btn btn-primary" onclick="confirmCategory()">✓ Готово</button>
    </div>
  </div>`;
}

function renderProductGrid() {
  const grid = document.getElementById('productsGrid'); if (!grid) return;
  const quantities = window.currentQuantities || {};
  grid.innerHTML = currentProducts.map(p => {
    const qty = quantities[p.id] || 0;
    const step = p.name.includes('1/') ? 5 : 1;
    const imgUrl = getImageUrl(p.picture);
    return `<div class="product-card" onclick="addToCarry(${p.id}, ${step})">
      <img src="${imgUrl}" class="product-image" loading="lazy" onerror="this.src='/icons/icon-192x192.png'">
      ${qty > 0 ? `<div class="product-qty" onclick="event.stopPropagation(); removeFromCarry(${p.id}, ${step})">${qty}</div>` : ''}
      <div class="product-info"><div class="product-name">${p.name}</div><div class="product-code">${p.vendor_code || ''}</div></div>
    </div>`;
  }).join('');
}

async function addToCarry(productId, step) {
  if (!window.currentQuantities) window.currentQuantities = {};
  window.currentQuantities[productId] = (window.currentQuantities[productId] || 0) + step;
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
  const hasItems = Object.values(window.currentQuantities || {}).some(q => q > 0);
  if (!hasItems) { alert('Выберите товары'); return; }
  await apiPost('/api/carry/complete-category', { categoryId: currentCategoryId });
  window.currentQuantities = {};
  alert('Заявка подтверждена'); showCarryCategories();
}

// ПЕЧАТНАЯ ФОРМА категории
async function printCategory() {
  const data = await apiGet(`/api/carry/print/${currentCategoryId}`);
  if (data.items.length === 0) {
    alert('Нет товаров для печати');
    return;
  }
  window.printData = data;
  currentView = 'print'; renderApp();
}

function renderPrint() {
  const data = window.printData || { date: '', category: '', items: [] };
  return `<div class="main-layout">
    <div class="header"><button class="back-btn" onclick="showCarryProducts(${currentCategoryId}, '${currentCategoryName}')">‹ Назад</button><div class="header-title">Печать</div><button class="btn btn-primary" onclick="window.print()" style="padding: 8px 16px; font-size: 14px;">🖨️ Печать</button></div>
    <div style="padding: 20px; background: white; color: black;">
      <h2 style="margin-bottom: 5px;">Заявка на занос</h2>
      <p style="color: #666; margin-bottom: 5px;">${data.date}</p>
      <p style="font-weight: bold; margin-bottom: 20px; font-size: 18px;">${data.category}</p>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid #333;">
            <th style="text-align: left; padding: 8px;">№</th>
            <th style="text-align: left; padding: 8px;">Товар</th>
            <th style="text-align: left; padding: 8px;">Артикул</th>
            <th style="text-align: center; padding: 8px;">Кол-во</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map((item, i) => `<tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px;">${i + 1}</td>
            <td style="padding: 8px;">${item.name}</td>
            <td style="padding: 8px; color: #666;">${item.vendor_code || '-'}</td>
            <td style="padding: 8px; text-align: center; font-weight: bold;">${item.quantity}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

// Carry Assembly - СБОРКА
async function showCarryAssembly() { 
  currentView = 'carry-assembly'; renderApp(); 
  const items = await apiGet('/api/carry/assembly'); 
  renderAssemblyList(items); 
}

function renderCarryAssembly() { 
  return `<div class="main-layout">
    <div class="header"><button class="back-btn" onclick="showCarryCategories()">‹ Назад</button><div class="header-title">Сборка</div><button class="btn btn-secondary" onclick="printAssembly()" style="padding: 8px 16px; font-size: 14px;">🖨️ Печать</button></div>
    <div id="assemblyList"></div>
    <div style="height: 80px;"></div>
    <div class="bottom-actions"><button class="btn btn-primary" onclick="completeOrder()">✓ Заявка собрана</button></div>
  </div>`; 
}

function renderAssemblyList(items) {
  const container = document.getElementById('assemblyList'); if (!container) return;
  if (items.length === 0) { container.innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div>Нет товаров в сборке<br><small style="color: var(--ios-gray);">Выберите товары в категориях</small></div>'; return; }
  container.innerHTML = items.map(item => `<div class="assembly-item"><div class="assembly-checkbox" id="cb-${item.id}" onclick="toggleCollected(${item.id})"></div><div class="assembly-content"><div style="font-weight: 500;">${item.product_name}</div><div class="product-code">${item.vendor_code || ''} | ${item.category_name}</div></div><div class="assembly-qty">${item.quantity}</div></div>`).join('');
}

function toggleCollected(requestId) {
  const cb = document.getElementById(`cb-${requestId}`);
  if (collectedIds.has(requestId)) { collectedIds.delete(requestId); cb.classList.remove('checked'); }
  else { collectedIds.add(requestId); cb.classList.add('checked'); }
}

async function completeOrder() {
  if (collectedIds.size === 0) { alert('Отметьте собранные товары'); return; }
  await apiPost('/api/carry/mark-collected', { requestIds: Array.from(collectedIds) });
  await apiPost('/api/carry/complete-order', {});
  collectedIds.clear(); alert('Сборка завершена'); showMainMenu();
}

// ПЕЧАТЬ СБОРКИ
async function printAssembly() {
  const data = await apiGet('/api/carry/print-all');
  if (data.items.length === 0) {
    alert('Нет товаров для печати');
    return;
  }
  window.printData = data;
  currentView = 'print'; renderApp();
}

// Price Check
async function showPriceCheckCategories() { currentView = 'price-check-categories'; renderApp(); const categories = await apiGet('/api/catalog/categories'); const list = document.getElementById('pcCategoriesList'); if (list) list.innerHTML = categories.map(c => `<div class="category-item" onclick="showPriceCheckPages(${c.id}, '${c.name}')"><span class="category-name">${c.name}</span><span class="category-arrow">›</span></div>`).join(''); }
function renderPriceCheckCategories() { return `<div class="main-layout"><div class="header"><button class="back-btn" onclick="showMainMenu()">‹ Назад</button><div class="header-title">Проверка ценников</div><div></div></div><div class="categories-list" id="pcCategoriesList"><div class="loading">Загрузка...</div></div></div>`; }

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
    return `<div class="pc-product"><img src="${imgUrl}" class="pc-product-image" onerror="this.src='/icons/icon-192x192.png'"><div class="pc-product-info"><div class="pc-product-name">${p.name}</div><div class="pc-product-code">${p.vendor_code || ''}</div><div class="pc-product-actions"><button class="pc-btn problem ${p.has_problem ? 'active' : ''}" onclick="toggleProblem(${p.id})">Проблема</button><button class="pc-btn price ${p.price_checked ? 'active' : ''}" onclick="togglePrice(${p.id})">Ценник</button></div></div></div>`;
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

function renderAdmin() {
  return `<div class="main-layout"><div class="header"><button class="back-btn" onclick="showMainMenu()">‹ Назад</button><div class="header-title">Админка</div><div></div></div>
    <div class="admin-sections">
      <div class="admin-card"><div class="admin-card-title">Обзор</div><div id="adminOverview"><div class="loading">Загрузка...</div></div></div>
      <div class="admin-card"><div class="admin-card-title">Синхронизация</div>
        <button class="btn btn-primary" onclick="startSync()" style="margin-bottom: 8px; width: 100%;">🔄 Обновить каталог</button>
        <button class="btn btn-secondary" onclick="resetSync()" style="width: 100%;">Сбросить обновление</button>
      </div>
    </div>
  </div>`;
}

async function startSync() { 
  await apiPost('/api/sync/start', {}); 
  alert('Синхронизация запущена'); 
  // Обновляем статус каждые 3 секунды
  const interval = setInterval(async () => {
    await loadAdminOverview();
    const data = await apiGet('/api/admin/overview');
    if (data?.syncStatus?.status === 'completed' || data?.syncStatus?.status === 'error') {
      clearInterval(interval);
    }
  }, 3000);
}

async function resetSync() { await apiPost('/api/sync/reset', {}); alert('Синхронизация сброшена'); loadAdminOverview(); }

// Init on load
document.addEventListener('DOMContentLoaded', init);
