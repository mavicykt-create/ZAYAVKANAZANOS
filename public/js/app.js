// ZAN 1.2 - Умный склад (Apple Design)
const API_URL = '';

// State
let currentUser = null;
let currentView = 'login';

let currentCategoryId = null;
let currentCategoryName = '';
let currentProducts = [];
let currentPageNumber = null;
let collectedIds = new Set();

let completedCategories = {};

const imageCache = new Map();
let preloadedImages = new Set();

let userColors = {};
let productClicks = {};

let priceCheckCurrentPage = 1;
let priceCheckTotalPages = 1;
let priceCheckMarks = {};

let shiftStatus = 'not_started';
let shiftTime = null;

let pendingClaimsCount = 0;
let claimsList = [];
let currentClaimId = null;

let calendarWeekOffset = 0;
let calendarTodos = {};
let calendarNotes = {};
let calendarPendingDates = {};

let adminActiveTab = 'overview';

let allUsersList = [];

let complexityScale = [];

let chatMessages = [];
let currentProfileTab = 'info';

let shiftHistoryData = [];

// Initialize
async function init() {
  const user = await apiGet('/api/auth/me');
  if (user) {
    currentUser = user;
    allUsersList = await apiGet('/api/admin/users') || [];
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

async function apiPut(endpoint, data) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
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

async function apiDelete(endpoint) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      credentials: 'include'
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

function preloadImage(src) {
  if (!src || preloadedImages.has(src)) return;
  const img = new Image();
  img.src = src;
  preloadedImages.add(src);
}

function createCachedImage(src, className, alt = '') {
  const cachedSrc = imageCache.get(src);
  if (cachedSrc) {
    return `<img src="${cachedSrc}" class="${className}" alt="${alt}" decoding="async" style="transition: none !important; animation: none !important;">`;
  }
  preloadImage(src);
  return `<img src="${src}" class="${className}" alt="${alt}" decoding="async" loading="lazy" 
    onload="imageCache.set('${src}', this.src)" 
    onerror="this.src='/icons/icon-192x192.png'; this.onerror=null;"
    style="transition: none !important; animation: none !important;">`;
}

// ===== RENDER APP =====
function renderApp() {
  const app = document.getElementById('app');
  switch (currentView) {
    case 'login': app.innerHTML = renderLogin(); break;
    case 'menu': app.innerHTML = renderMainMenu(); break;
    case 'carry-categories': app.innerHTML = renderCarryCategories(); break;
    case 'carry-products': app.innerHTML = renderCarryProducts(); break;
    case 'carry-assembly': app.innerHTML = renderCarryAssembly(); break;
    case 'price-check-new': app.innerHTML = renderPriceCheckCategories(); break;
    case 'price-check-print': app.innerHTML = renderPriceCheckPrint(); break;
    case 'product-check': app.innerHTML = renderProductCheck(); break;
    case 'calendar': app.innerHTML = renderCalendar(); break;
    case 'admin': app.innerHTML = renderAdmin(); break;
    case 'print': app.innerHTML = renderPrint(); break;
    case 'claims': app.innerHTML = renderClaimsList(); break;
    case 'claims-detail': app.innerHTML = renderClaimDetail(); break;
    case 'expiry-check': app.innerHTML = renderExpiryCheck(); break;
    case 'special-tasks': app.innerHTML = renderSpecialTasks(); break;
    case 'profile': app.innerHTML = renderProfile(); break;
    case 'chat': app.innerHTML = renderChat(); break;
  }
}

// ===== LOGIN =====
function renderLogin() {
  return `<div class="login-screen">
    <div class="login-logo">ZAN 1.2</div>
    <div class="login-subtitle">Умный склад</div>
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
  allUsersList = await apiGet('/api/admin/users') || [];
  showMainMenu();
}

function showLogin() { currentView = 'login'; renderApp(); }

// ===== MAIN MENU =====
function renderMainMenu() {
  const isAdmin = currentUser?.role === 'admin';
  
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
  } else if (shiftStatus === 'day_off') {
    shiftBtnClass = 'btn-secondary';
    shiftBtnText = '🏖️ Выходной';
  }
  
  // Проверяем незакрытые задачи
  const hasPendingTasks = Object.keys(calendarPendingDates).length > 0;
  
  return `<div class="main-layout">
    <div class="header">
      <div class="header-title">ZAN 1.2</div>
      <div class="header-user">
        <span id="shiftIndicator" style="margin-right: 8px; font-size: 13px;"></span>
        <span style="color: var(--ios-gray); font-size: 15px; margin-right: 8px;">${currentUser.login}</span>
        <button class="logout-btn" onclick="handleLogout()">Выйти</button>
      </div>
    </div>
    <div style="padding: 8px 16px; background: var(--ios-card); text-align: center;">
      <span id="lastSyncDate" style="font-size: 12px; color: var(--ios-gray);">Загрузка...</span>
    </div>
    <div style="padding: 12px 16px;">
      <button class="btn ${shiftBtnClass}" onclick="startShift()" style="width: 100%;" ${shiftStatus !== 'not_started' && shiftStatus !== 'no_show' && shiftStatus !== 'day_off' ? 'disabled' : ''}>
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
        ${hasPendingTasks ? '<span class="menu-badge">!</span>' : ''}
        <div class="menu-label">Календарь недели</div>
      </div>
      <div class="menu-item" onclick="showExpiryCheck()">
        <div class="menu-icon">⏱️</div>
        <div class="menu-label">Проверка срока</div>
      </div>
      <div class="menu-item" onclick="showSpecialTasks()">
        <div class="menu-icon">⭐</div>
        <div class="menu-label">Спец задания</div>
      </div>
      <div class="menu-item" onclick="showClaims()" style="position: relative;">
        <div class="menu-icon">⚠️</div>
        <div class="menu-label">Претензии</div>
        ${pendingClaimsCount > 0 ? `<span class="menu-badge">${pendingClaimsCount}</span>` : ''}
      </div>
      <div class="menu-item" onclick="showChat()">
        <div class="menu-icon">💬</div>
        <div class="menu-label">Чат</div>
      </div>
      <div class="menu-item" onclick="showProfile()">
        <div class="menu-icon">👤</div>
        <div class="menu-label">Личный кабинет</div>
      </div>
      ${isAdmin ? `<div class="menu-item" onclick="showAdmin()">
        <div class="menu-icon">⚙️</div>
        <div class="menu-label">Админка</div>
      </div>` : ''}
    </div>
    <button class="install-btn" id="installBtn" style="display:none" onclick="installApp()">Установить приложение</button>
  </div>`;
}

function showMainMenu() { currentView = 'menu'; renderApp(); checkShiftStatus(); loadLastSyncDate(); loadPendingClaimsCount(); loadCalendarPendingDates(); checkInstallPrompt(); }

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

// ===== SHIFT =====
async function checkShiftStatus() {
  const data = await apiGet('/api/shift/my-today');
  if (data) {
    shiftStatus = data.status;
    shiftTime = data.start_time_yakutsk;
    updateShiftIndicator();
  }
}

function updateShiftIndicator() {
  const indicator = document.getElementById('shiftIndicator');
  if (!indicator) return;
  
  if (shiftStatus === 'started' || shiftStatus === 'on_time') {
    indicator.innerHTML = `<span style="color: var(--ios-green);">✓ Смена начата ${shiftTime}</span>`;
  } else if (shiftStatus === 'late') {
    indicator.innerHTML = `<span style="color: var(--ios-orange);">⚠ Опоздание ${shiftTime}</span>`;
  } else if (shiftStatus === 'no_show') {
    indicator.innerHTML = `<span style="color: var(--ios-red);">✗ Не выход</span>`;
  } else if (shiftStatus === 'day_off') {
    indicator.innerHTML = `<span style="color: var(--ios-blue);">🏖️ Выходной</span>`;
  } else {
    indicator.innerHTML = '';
  }
}

async function startShift() {
  const result = await apiPost('/api/shift/start', {});
  if (result.success) {
    shiftStatus = result.status;
    shiftTime = result.startTime;
    updateShiftIndicator();
    showMainMenu();
  } else {
    alert(result.error || 'Ошибка');
  }
}

async function handleLogout() { await apiPost('/api/auth/logout', {}); currentUser = null; showLogin(); }

// ===== CLAIMS =====
async function loadPendingClaimsCount() {
  const data = await apiGet('/api/claims/pending-count');
  if (data) {
    pendingClaimsCount = data.count;
    if (currentView === 'menu') renderApp();
  }
}

async function showClaims() {
  currentView = 'claims'; renderApp();
  await loadClaimsList();
}

async function loadClaimsList() {
  const list = document.getElementById('claimsList');
  if (list) list.innerHTML = '<div class="loading">Загрузка...</div>';

  const data = await apiGet('/api/claims/list');
  claimsList = data || [];

  if (list) renderClaimsItems();
}

function renderClaimsItems() {
  const list = document.getElementById('claimsList');
  if (!list) return;

  if (claimsList.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div>Нет претензий</div>';
    return;
  }

  list.innerHTML = claimsList.map(c => {
    const statusClass = c.status === 'pending' ? 'status-pending' : c.status === 'in_progress' ? 'status-progress' : c.status === 'approved' ? 'status-approved' : 'status-rejected';
    const statusText = c.status === 'pending' ? 'Новая' : c.status === 'in_progress' ? 'В работе' : c.status === 'approved' ? 'Подтверждена' : 'Отклонена';

    return `<div class="claim-item" onclick="showClaimDetail(${c.id})">
      <div class="claim-header">
        <span class="claim-status ${statusClass}">${statusText}</span>
        <span class="claim-date">${new Date(c.created_at).toLocaleString('ru-RU')}</span>
      </div>
      <div class="claim-text">${c.claim_text}</div>
      ${c.assigned_to_name ? `<div class="claim-assignee">👤 ${c.assigned_to_name}</div>` : ''}
      ${c.check_number ? `<div class="claim-meta">Чек: ${c.check_number}</div>` : ''}
      ${c.attachment_path ? `<div style="font-size: 12px; color: var(--ios-blue);">📎 Есть вложение</div>` : ''}
    </div>`;
  }).join('');
}

async function showClaimDetail(claimId) {
  currentClaimId = claimId;
  currentView = 'claims-detail'; renderApp();

  const data = await apiGet(`/api/claims/${claimId}`);
  if (!data) {
    document.getElementById('claimDetail').innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
    return;
  }

  renderClaimDetailContent(data);
}

function renderClaimDetailContent(claim) {
  const container = document.getElementById('claimDetail');
  if (!container) return;

  const isAdmin = currentUser?.role === 'admin';
  const statusClass = claim.status === 'pending' ? 'status-pending' : claim.status === 'in_progress' ? 'status-progress' : claim.status === 'approved' ? 'status-approved' : 'status-rejected';
  const statusText = claim.status === 'pending' ? 'Новая' : claim.status === 'in_progress' ? 'В работе' : claim.status === 'approved' ? 'Подтверждена' : 'Отклонена';

  let html = `<div class="claim-detail-card">
    <div class="claim-detail-header">
      <span class="claim-status ${statusClass}">${statusText}</span>
      <span class="claim-id">#${claim.id}</span>
    </div>

    <div class="claim-detail-section">
      <div class="claim-detail-label">Суть претензии</div>
      <div class="claim-detail-value">${claim.claim_text}</div>
    </div>

    ${claim.check_number ? `<div class="claim-detail-section">
      <div class="claim-detail-label">Номер чека</div>
      <div class="claim-detail-value">${claim.check_number}</div>
    </div>` : ''}

    ${claim.purchase_time ? `<div class="claim-detail-section">
      <div class="claim-detail-label">Время покупки</div>
      <div class="claim-detail-value">${claim.purchase_time}</div>
    </div>` : ''}

    ${claim.order_info ? `<div class="claim-detail-section">
      <div class="claim-detail-label">Заказ / Сборка</div>
      <div class="claim-detail-value">${claim.order_info}</div>
    </div>` : ''}

    ${claim.missing_products ? `<div class="claim-detail-section">
      <div class="claim-detail-label">Каких товаров нет</div>
      <div class="claim-detail-value">${claim.missing_products}</div>
    </div>` : ''}

    ${claim.attachment_path ? `<div class="claim-detail-section">
      <div class="claim-detail-label">Вложение</div>
      <a href="${claim.attachment_path}" target="_blank" class="claim-attachment-link">📎 Открыть вложение</a>
    </div>` : ''}

    ${claim.created_at ? `<div class="claim-detail-section">
      <div class="claim-detail-label">Создана</div>
      <div class="claim-detail-value">${new Date(claim.created_at).toLocaleString('ru-RU')}</div>
    </div>` : ''}
  </div>`;

  // Action buttons
  if (claim.status === 'pending') {
    html += `<div class="claim-actions">
      <button class="btn btn-primary" onclick="startClaimTask(${claim.id})" style="width: 100%;">Взять в работу</button>
    </div>`;
  } else if (claim.status === 'in_progress' && (claim.assigned_to === currentUser.id || isAdmin)) {
    html += `<div class="claim-detail-card">
      <div class="claim-detail-label">Решение</div>
      <textarea id="claimResolution" class="form-input" placeholder="Опишите ваше решение..." style="min-height: 80px; margin-bottom: 8px;"></textarea>
      <div style="margin-bottom: 12px;">
        <label style="font-size: 13px; color: var(--ios-gray); display: block; margin-bottom: 4px;">Доказательства (фото/видео/документ)</label>
        <input type="file" id="claimEvidenceFile" accept="image/*,video/*,.pdf,.doc,.docx" onchange="handleEvidenceFile(this)">
        <div id="evidenceFileName" style="font-size: 12px; color: var(--ios-green); margin-top: 4px;"></div>
      </div>
      <div style="display: flex; gap: 12px;">
        <button class="btn btn-success" onclick="resolveClaim(${claim.id}, 'approved')" style="flex: 1;">✓ Подтвердить</button>
        <button class="btn btn-danger" onclick="resolveClaim(${claim.id}, 'rejected')" style="flex: 1;">✗ Отклонить</button>
      </div>
    </div>`;
  } else if (claim.status === 'in_progress') {
    html += `<div class="claim-actions">
      <div class="claim-detail-label">В работе у: ${claim.assigned_to_name || 'другой сотрудник'}</div>
    </div>`;
  }

  // Show resolution if resolved
  if (claim.status === 'approved' || claim.status === 'rejected') {
    const verdictText = claim.verdict === 'approved' ? '✓ Подтверждена' : '✗ Отклонена';
    const verdictColor = claim.verdict === 'approved' ? 'var(--ios-green)' : 'var(--ios-red)';
    html += `<div class="claim-detail-card">
      <div class="claim-detail-label">Результат</div>
      <div style="color: ${verdictColor}; font-weight: 600; margin-bottom: 8px;">${verdictText}</div>
      ${claim.resolution ? `<div class="claim-detail-value">${claim.resolution}</div>` : ''}
      ${claim.assigned_to_name ? `<div class="claim-detail-label" style="margin-top: 8px;">Ответственный: ${claim.assigned_to_name}</div>` : ''}
      ${claim.evidence_path ? `<a href="${claim.evidence_path}" target="_blank" class="claim-attachment-link">📎 Доказательство</a>` : ''}
    </div>`;
  }

  // Admin edit button
  if (isAdmin) {
    html += `<div class="claim-actions">
      <button class="btn btn-secondary" onclick="editClaim(${claim.id})" style="width: 100%;">✏️ Редактировать</button>
    </div>`;
  }

  container.innerHTML = html;
}

async function startClaimTask(claimId) {
  const result = await apiPost(`/api/claims/${claimId}/start`, {});
  if (result.success) {
    await showClaimDetail(claimId);
    await loadPendingClaimsCount();
  } else {
    alert(result.error || 'Ошибка');
  }
}

let evidenceFileData = null;
let evidenceFileType = null;
let evidenceFileName = null;

function handleEvidenceFile(input) {
  const file = input.files[0];
  if (!file) return;

  evidenceFileName = file.name;
  evidenceFileType = file.type;
  document.getElementById('evidenceFileName').textContent = `Выбран: ${file.name}`;

  const reader = new FileReader();
  reader.onload = function(e) {
    evidenceFileData = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function resolveClaim(claimId, verdict) {
  const resolution = document.getElementById('claimResolution')?.value || '';

  const result = await apiPost(`/api/claims/${claimId}/resolve`, { verdict, resolution });
  if (!result.success) {
    alert(result.error || 'Ошибка');
    return;
  }

  if (evidenceFileData) {
    await apiPost(`/api/claims/${claimId}/evidence`, {
      fileData: evidenceFileData,
      fileType: evidenceFileType,
      fileName: evidenceFileName
    });
    evidenceFileData = null;
    evidenceFileType = null;
    evidenceFileName = null;
  }

  await loadPendingClaimsCount();
  await showClaimDetail(claimId);
}

// Admin edit claim
async function editClaim(claimId) {
  const claim = claimsList.find(c => c.id === claimId);
  if (!claim) return;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'editClaimModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 450px; max-height: 85vh; overflow-y: auto;">
      <h3 class="modal-title">Редактировать претензию #${claim.id}</h3>
      <input type="text" id="editClaimCheck" class="form-input" placeholder="Номер чека" value="${claim.check_number || ''}" style="margin-bottom: 8px;">
      <input type="text" id="editClaimTime" class="form-input" placeholder="Время покупки" value="${claim.purchase_time || ''}" style="margin-bottom: 8px;">
      <input type="text" id="editClaimOrder" class="form-input" placeholder="Заказ / Сборка" value="${claim.order_info || ''}" style="margin-bottom: 8px;">
      <textarea id="editClaimMissing" class="form-input" placeholder="Каких товаров нет" style="margin-bottom: 8px; min-height: 60px;">${claim.missing_products || ''}</textarea>
      <textarea id="editClaimText" class="form-input" placeholder="Суть претензии *" style="margin-bottom: 8px; min-height: 80px;">${claim.claim_text || ''}</textarea>
      <select id="editClaimStatus" class="form-input" style="margin-bottom: 8px;">
        <option value="pending" ${claim.status === 'pending' ? 'selected' : ''}>Новая</option>
        <option value="in_progress" ${claim.status === 'in_progress' ? 'selected' : ''}>В работе</option>
        <option value="approved" ${claim.status === 'approved' ? 'selected' : ''}>Подтверждена</option>
        <option value="rejected" ${claim.status === 'rejected' ? 'selected' : ''}>Отклонена</option>
      </select>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeEditClaimModal()">Отмена</button>
        <button class="btn btn-primary" onclick="saveClaimEdit(${claim.id})">Сохранить</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function closeEditClaimModal() {
  const modal = document.getElementById('editClaimModal');
  if (modal) modal.remove();
}

async function saveClaimEdit(claimId) {
  const payload = {
    checkNumber: document.getElementById('editClaimCheck').value,
    purchaseTime: document.getElementById('editClaimTime').value,
    orderInfo: document.getElementById('editClaimOrder').value,
    missingProducts: document.getElementById('editClaimMissing').value,
    claimText: document.getElementById('editClaimText').value,
    status: document.getElementById('editClaimStatus').value
  };

  const result = await apiPut(`/api/claims/${claimId}`, payload);
  if (result.success) {
    closeEditClaimModal();
    await loadClaimsList();
    await showClaimDetail(claimId);
  } else {
    alert(result.error || 'Ошибка');
  }
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; const btn = document.getElementById('installBtn'); if (btn) btn.style.display = 'block'; });
async function installApp() { if (!deferredPrompt) return; deferredPrompt.prompt(); const result = await deferredPrompt.userChoice; if (result.outcome === 'accepted') { document.getElementById('installBtn').style.display = 'none'; } deferredPrompt = null; }
function checkInstallPrompt() { if (deferredPrompt) { const btn = document.getElementById('installBtn'); if (btn) btn.style.display = 'block'; } }

function renderClaimsList() {
  return `<div class="main-layout">
    <div class="header">
      <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
      <div class="header-title">Претензии</div>
      <div></div>
    </div>
    <div class="claims-list" id="claimsList"><div class="loading">Загрузка...</div></div>
  </div>`;
}

function renderClaimDetail() {
  return `<div class="main-layout">
    <div class="header">
      <button class="back-btn" onclick="showClaims()">‹ Назад</button>
      <div class="header-title">Претензия #${currentClaimId || ''}</div>
      <div></div>
    </div>
    <div id="claimDetail" style="padding: 16px;"><div class="loading">Загрузка...</div></div>
  </div>`;
}

// ===== ЗАЯВКА НА ЗАНОС =====

async function showCarryCategories() {
  currentView = 'carry-categories'; renderApp();
  
  const [categories, statusData] = await Promise.all([
    apiGet('/api/catalog/categories'),
    apiGet('/api/carry/categories-status')
  ]);
  
  const list = document.getElementById('categoriesList');
  if (list && categories) {
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

async function showCarryProducts(categoryId, categoryName) {
  currentCategoryId = categoryId; 
  currentCategoryName = categoryName; 
  currentView = 'carry-products'; 
  renderApp();
  
  document.getElementById('categoryTitle').textContent = categoryName;
  
  const [products, myRequests, categoryStats, colorsData, clicksData] = await Promise.all([
    apiGet(`/api/catalog/products/${categoryId}`),
    apiGet('/api/carry/requests'),
    apiGet(`/api/carry/category-stats/${categoryId}`),
    apiGet('/api/carry/user-colors'),
    apiGet(`/api/carry/product-clicks/${categoryId}`)
  ]);
  
  currentProducts = products || [];
  
  userColors = {};
  if (colorsData) {
    colorsData.forEach(u => {
      userColors[u.user_id] = u.color || '#007AFF';
    });
  }
  
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
  
  currentProducts.forEach(p => {
    if (p.picture) preloadImage(getImageUrl(p.picture));
  });
  
  window.currentQuantities = {};
  if (myRequests) {
    myRequests.forEach(r => {
      if (r.category_id === categoryId) {
        window.currentQuantities[r.product_id] = r.quantity;
      }
    });
  }
  
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

function calculateStockBoxes(stockQuantity, boxCount, blockCount) {
  if (!stockQuantity || !boxCount || !blockCount) return null;
  return (stockQuantity / boxCount / blockCount).toFixed(2);
}

function getStockStatus(stockQuantity, boxCount, blockCount) {
  const boxes = calculateStockBoxes(stockQuantity, boxCount, blockCount);
  if (boxes === null) return { text: '', class: '', boxes: 0 };
  if (boxes < 1) return { text: 'Последний', class: 'stock-last', boxes: boxes };
  return { text: boxes, class: 'stock-normal', boxes: boxes };
}

// Определяем шаг добавления для товара
function getProductStep(product) {
  // Если в названии есть "1/" — кратность 5
  if (product.name && product.name.includes('1/')) return 5;
  // Иначе шаг 1
  return 1;
}

function renderProductGrid() {
  const grid = document.getElementById('productsGrid'); 
  if (!grid) return;
  
  const quantities = window.currentQuantities || {};
  
  if (grid.children.length === currentProducts.length) {
    currentProducts.forEach((p, index) => {
      const qty = quantities[p.id] || 0;
      const card = grid.children[index];
      const qtyEl = card.querySelector('.product-qty-left');
      const clickEl = card.querySelector('.product-click-indicator');
      
      const step = getProductStep(p);
      
      if (qty > 0) {
        if (qtyEl) {
          qtyEl.textContent = qty;
        } else {
          const newQtyEl = document.createElement('div');
          newQtyEl.className = 'product-qty-left';
          newQtyEl.textContent = qty;
          newQtyEl.onclick = (e) => { e.stopPropagation(); removeFromCarry(p.id, step); };
          card.appendChild(newQtyEl);
        }
      } else if (qtyEl) {
        qtyEl.remove();
      }
      
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
  
  grid.innerHTML = currentProducts.map(p => {
    const qty = quantities[p.id] || 0;
    const step = getProductStep(p);
    const imgUrl = getImageUrl(p.picture);
    const clickData = productClicks[p.id];
    
    const stockStatus = getStockStatus(p.stock_quantity, p.box_count, p.block_count);

    return `<div class="product-card ${stockStatus.class}" onclick="addToCarry(${p.id})" data-product-id="${p.id}">
      ${createCachedImage(imgUrl, 'product-image', p.name)}
      ${qty > 0 ? `<div class="product-qty-left" onclick="event.stopPropagation(); removeFromCarry(${p.id}, ${step})">${qty}</div>` : ''}
      ${clickData ? `<div class="product-click-indicator" style="background-color: ${clickData.color}" title="Нажал: ${clickData.login}"></div>` : ''}
      ${stockStatus.text ? `<div class="stock-badge ${stockStatus.class}">${stockStatus.text}</div>` : ''}
      <div class="product-info"><div class="product-name">${p.name}</div></div>
    </div>`;
  }).join('');
}

async function addToCarry(productId) {
  const product = currentProducts.find(p => p.id === productId);
  if (!product) return;
  
  const stockStatus = getStockStatus(product.stock_quantity, product.box_count, product.block_count);

  if (stockStatus && stockStatus.boxes < 1) {
    const confirmed = confirm('Последний остаток на складе! \n\nВы уверены, что хотите добавить этот товар?');
    if (!confirmed) return;
  }

  const step = getProductStep(product);

  if (!window.currentQuantities) window.currentQuantities = {};
  window.currentQuantities[productId] = (window.currentQuantities[productId] || 0) + step;
  
  await apiPost('/api/carry/product-click', { productId, categoryId: currentCategoryId });
  
  productClicks[productId] = {
    userId: currentUser.id,
    color: userColors[currentUser.id] || '#007AFF',
    login: currentUser.login
  };
  
  await apiPost('/api/carry/request', { categoryId: currentCategoryId, productId: productId, quantity: window.currentQuantities[productId] });
  renderProductGrid();
}

async function removeFromCarry(productId, step) {
  const product = currentProducts.find(p => p.id === productId);
  const actualStep = step || (product ? getProductStep(product) : 1);
  
  if (!window.currentQuantities) window.currentQuantities = {};
  window.currentQuantities[productId] = Math.max(0, (window.currentQuantities[productId] || 0) - actualStep);
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

// Carry Assembly
async function showCarryAssembly() { 
  currentView = 'carry-assembly'; renderApp(); 
  
  const [items, collected] = await Promise.all([
    apiGet('/api/carry/assembly-all'),
    apiGet('/api/carry/collected-items')
  ]);
  
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

  if (!items || items.length === 0) { 
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div>Нет товаров в сборке<br><small style="color: var(--ios-gray);">Выберите товары в категориях</small></div>'; 
    if (statsEl) statsEl.innerHTML = '';
    return; 
  }

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
  
  if (newCollected) {
    collectedIds.add(productId);
  } else {
    collectedIds.delete(productId);
  }
  
  const cb = document.getElementById(`cb-${productId}`);
  if (cb) {
    cb.classList.toggle('checked', newCollected);
  }
  
  const items = await apiGet('/api/carry/assembly-all');
  renderAssemblyList(items);
  
  await apiPost('/api/carry/toggle-collected', { productId, collected: newCollected });
}

async function completeOrder() {
  if (collectedIds.size === 0) { alert('Отметьте собранные товары'); return; }
  
  const result = await apiPost('/api/carry/complete-order-reset', {});
  
  if (result.success) {
    alert('Сборка завершена! Все счетчики сброшены.'); 
    
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

async function printAssembly() {
  const data = await apiGet('/api/carry/print-all');
  if (!data || !data.items || data.items.length === 0) {
    alert('Нет товаров для печати');
    return;
  }
  window.printData = data;
  currentView = 'print'; renderApp();
}


// ===== ПРОВЕРКА ЦЕННИКОВ =====

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
      <button class="btn btn-secondary" onclick="printPriceCheck()" style="padding: 8px 16px; font-size: 14px;">🖨️ Печать</button>
    </div>
    <div id="priceCheckTotal" style="padding: 12px 16px; background: var(--ios-card); font-weight: 600; text-align: center;"></div>
    <div class="price-check-grid" id="priceCheckGrid"></div>
    <div id="priceCheckPagination" style="padding: 16px; display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;"></div>
  </div>`; 
}

async function loadPriceCheckNew() {
  const [totalData, productsData, marksData] = await Promise.all([
    apiGet('/api/price-check/total-count'),
    apiGet(`/api/price-check/all-products?page=${priceCheckCurrentPage}`),
    apiGet('/api/price-check/all-marks')
  ]);
  
  priceCheckMarks = {};
  if (marksData) {
    marksData.forEach(m => {
      priceCheckMarks[m.product_id] = m.mark_type;
    });
  }
  
  const totalEl = document.getElementById('priceCheckTotal');
  if (totalEl && totalData) {
    totalEl.textContent = `Всего товаров: ${totalData.count}`;
  }
  
  if (productsData) {
    priceCheckTotalPages = productsData.totalPages || 1;
    renderPriceCheckPagination();
  }
  
  renderPriceCheckGrid(productsData?.products || []);
}

function renderPriceCheckPagination() {
  const container = document.getElementById('priceCheckPagination');
  if (!container) return;
  
  let html = '';
  const maxVisible = 5;
  
  let startPage = Math.max(1, priceCheckCurrentPage - 2);
  let endPage = Math.min(priceCheckTotalPages, startPage + maxVisible - 1);
  
  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }
  
  if (priceCheckCurrentPage > 1) {
    html += `<button class="page-btn" onclick="changePriceCheckPage(${priceCheckCurrentPage - 1})">‹</button>`;
  }
  
  for (let i = startPage; i <= endPage; i++) {
    if (i === priceCheckCurrentPage) {
      html += `<button class="page-btn active">${i}</button>`;
    } else {
      html += `<button class="page-btn" onclick="changePriceCheckPage(${i})">${i}</button>`;
    }
  }
  
  if (endPage < priceCheckTotalPages) {
    html += `<span style="padding: 8px; color: var(--ios-gray);">...</span>`;
    html += `<button class="page-btn" onclick="changePriceCheckPage(${endPage + 1})">Далее</button>`;
  }
  
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

function getExpiryTrafficLight(expiryDate) {
  if (!expiryDate) return null;
  
  const parts = expiryDate.split('-');
  if (parts.length !== 3) return null;
  
  const expiry = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const now = new Date();
  const diffTime = expiry - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays > 90) return '#34C759';
  if (diffDays >= 60) return '#FF9500';
  return '#FF3B30';
}

function formatExpiryDate(expiryDate) {
  if (!expiryDate) return '';
  
  const parts = expiryDate.split('-');
  if (parts.length !== 3) return '';
  
  const day = parts[2].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[0].slice(-2);
  
  return `${day}.${month}.${year}`;
}

// Обновленное модальное окно проверки ценников
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
        <label class="price-check-option ${existingMark === 'delete_product' ? 'selected' : ''}">
          <input type="radio" name="markType" value="delete_product" ${existingMark === 'delete_product' ? 'checked' : ''} onchange="toggleExpiryInput(false)">
          <span>Удалить товар</span>
        </label>
        <label class="price-check-option ${existingMark === 'no_product' ? 'selected' : ''}">
          <input type="radio" name="markType" value="no_product" ${existingMark === 'no_product' ? 'checked' : ''} onchange="toggleExpiryInput(false)">
          <span>Нет такого товара на витрине</span>
        </label>
        <label class="price-check-option ${existingMark === 'new_price_tag' ? 'selected' : ''}">
          <input type="radio" name="markType" value="new_price_tag" ${existingMark === 'new_price_tag' ? 'checked' : ''} onchange="toggleExpiryInput(false)">
          <span>Нужен новый ценник</span>
        </label>
        <label class="price-check-option ${existingMark === 'fix_expiry' ? 'selected' : ''}">
          <input type="radio" name="markType" value="fix_expiry" ${existingMark === 'fix_expiry' ? 'checked' : ''} onchange="toggleExpiryInput(true)">
          <span>Исправить срок годности</span>
        </label>
        <div id="expiryInputContainer" style="display: none; padding-left: 32px;">
          <input type="text" id="newExpiryDate" class="form-input" placeholder="ДД.ММ.ГГ или текст" style="margin-bottom: 8px;" value="${expiryDate ? formatExpiryDate(expiryDate) : ''}">
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
  
  if (markType === 'remove') {
    delete priceCheckMarks[productId];
  } else {
    priceCheckMarks[productId] = markType;
  }
  
  closePriceCheckModal();
  loadPriceCheckNew();
}

// Печать проверки ценников — по категориям и алфавиту внутри, без вывода категорий
async function printPriceCheck() {
  const data = await apiGet('/api/price-check/print-check');
  if (!data || !data.items || data.items.length === 0) {
    alert('Нет отмеченных товаров для печати');
    return;
  }
  
  // Группируем по категориям для сортировки (но не выводим категории)
  // Данные уже отсортированы по категориям и имени на сервере
  
  window.printData = {
    date: data.date,
    items: data.items.map(item => ({
      vendor_code: item.vendor_code,
      name: item.name,
      expiry_date: formatExpiryDate(item.expiry_date),
      new_expiry: item.new_expiry || '',
      delete_product: item.mark_type === 'delete_product' ? '✓' : '',
      no_product: item.mark_type === 'no_product' ? '✓' : '',
      new_price_tag: item.mark_type === 'new_price_tag' ? '✓' : '',
      fix_expiry: item.mark_type === 'fix_expiry' ? '✓' : ''
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
            <th style="text-align: center; padding: 6px; font-size: 10px;">Удалить<br>товар</th>
            <th style="text-align: center; padding: 6px; font-size: 10px;">Нет на<br>витрине</th>
            <th style="text-align: center; padding: 6px; font-size: 10px;">Нужен<br>ценник</th>
            <th style="text-align: center; padding: 6px; font-size: 10px;">Исправить<br>срок</th>
            <th style="text-align: center; padding: 6px; font-size: 10px;">Новый<br>срок</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map((item, i) => `<tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 6px; font-weight: bold;">${item.vendor_code || '-'}</td>
            <td style="padding: 6px; font-weight: bold; line-height: 1.3;">${item.name}</td>
            <td style="padding: 6px; text-align: center; color: ${item.delete_product ? 'var(--ios-red)' : '#ccc'}; font-weight: bold;">${item.delete_product || '○'}</td>
            <td style="padding: 6px; text-align: center; color: ${item.no_product ? 'var(--ios-red)' : '#ccc'}; font-weight: bold;">${item.no_product || '○'}</td>
            <td style="padding: 6px; text-align: center; color: ${item.new_price_tag ? 'var(--ios-red)' : '#ccc'}; font-weight: bold;">${item.new_price_tag || '○'}</td>
            <td style="padding: 6px; text-align: center; color: ${item.fix_expiry ? 'var(--ios-red)' : '#ccc'}; font-weight: bold;">${item.fix_expiry || '○'}</td>
            <td style="padding: 6px; text-align: center; color: ${item.new_expiry ? 'var(--ios-blue)' : '#ccc'}; font-weight: bold;">${item.new_expiry || '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

// Product Check
async function showProductCheck() { currentView = 'product-check'; renderApp(); const products = await apiGet('/api/product-check/missing-barcodes'); const list = document.getElementById('pcMissingList'); if (list) { if (products.length === 0) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div>Все товары имеют штрих-коды</div>'; } else { list.innerHTML = products.map(p => `<div class="assembly-item"><div class="assembly-content"><div style="font-weight: 500;">${p.name}</div><div class="product-code">${p.category_name} | ${p.vendor_code || ''}</div></div><button class="icon-btn" onclick="hideProduct(${p.id})">✕</button></div>`).join(''); } } }
function renderProductCheck() { return `<div class="main-layout"><div class="header"><button class="back-btn" onclick="showMainMenu()">‹ Назад</button><div class="header-title">Проверка товара</div><div></div></div><div id="pcMissingList" style="padding: 16px;"><div class="loading">Загрузка...</div></div></div>`; }
async function hideProduct(productId) { await apiPost('/api/product-check/hide', { productId }); showProductCheck(); }


// ===== КАЛЕНДАРЬ =====

async function loadCalendarPendingDates() {
  const data = await apiGet('/api/calendar/pending-dates');
  if (data) {
    calendarPendingDates = data;
  }
}

function renderCalendar() {
  const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const today = new Date();
  const currentWeekStart = new Date(today); 
  currentWeekStart.setDate(today.getDate() - today.getDay() + 1 + (calendarWeekOffset * 7));
  
  let html = `<div class="main-layout">
    <div class="header">
      <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
      <div class="header-title">Календарь</div>
      <div></div>
    </div>
    <div style="padding: 8px 16px; background: var(--ios-card); display: flex; justify-content: space-between; align-items: center;">
      <button class="btn btn-secondary" onclick="changeCalendarWeek(-1)" style="padding: 6px 12px; font-size: 14px;">‹ Неделя</button>
      <span style="font-weight: 600; font-size: 14px;">${calendarWeekOffset === 0 ? 'Текущая' : calendarWeekOffset > 0 ? '+' + calendarWeekOffset : calendarWeekOffset} неделя</span>
      <button class="btn btn-secondary" onclick="changeCalendarWeek(1)" style="padding: 6px 12px; font-size: 14px;">Неделя ›</button>
    </div>`;
  
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
      const hasPendingTasks = calendarPendingDates[dateStr] > 0;
      const isSunday = d.getDay() === 0;
      
      html += `<div class="calendar-day ${isToday ? 'active' : ''} ${hasEvents ? 'has-events' : ''} ${hasPendingTasks ? 'has-pending' : ''} ${isSunday ? 'sunday' : ''}" onclick="showDayDetails('${dateStr}')">
        <span class="calendar-day-name">${days[i]}</span>
        <span class="calendar-day-number">${d.getDate()}</span>
        ${hasTodos ? '<span class="calendar-todo-dot"></span>' : ''}
        ${hasPendingTasks ? '<span class="calendar-pending-dot">!</span>' : ''}
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
  
  const [notes, todos] = await Promise.all([
    apiGet(`/api/calendar/items?startDate=${startDate}&endDate=${endDate}`),
    apiGet(`/api/calendar/todos-range?startDate=${startDate}&endDate=${endDate}`)
  ]);
  
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
  
  if (notes.length > 0) {
    html += `<div style="margin-bottom: 16px;">
      <h4 style="font-size: 14px; color: var(--ios-gray); margin-bottom: 8px;">📝 Заметки</h4>`;
    notes.forEach(n => {
      html += `<div class="event-item"><div class="event-title">${n.title}</div><div class="event-text">${n.text || ''}</div></div>`;
    });
    html += `</div>`;
  }
  
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
          ${t.assignee_ids ? `<div style="font-size: 11px; color: var(--ios-blue);">👤 Назначена</div>` : ''}
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
  await loadCalendarData();
  const activeDate = document.querySelector('.calendar-day.active');
  if (activeDate) {
    const onclickAttr = activeDate.getAttribute('onclick');
    const dateMatch = onclickAttr?.match(/'(\d{4}-\d{2}-\d{2})'/);
    if (dateMatch) {
      showDayDetails(dateMatch[1]);
    }
  }
}


// ===== АДМИНКА =====

async function showAdmin() { 
  currentView = 'admin'; 
  renderApp();
  loadAdminTab(adminActiveTab);
}

function renderAdmin() {
  const isSuperAdmin = currentUser?.login === 'admin';
  return `<div class="main-layout">
    <div class="header">
      <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
      <div class="header-title">Администрирование</div>
      <div></div>
    </div>
    <div class="admin-nav">
      <div class="admin-tab ${adminActiveTab === 'overview' ? 'active' : ''}" onclick="switchAdminTab('overview')">Обзор</div>
      <div class="admin-tab ${adminActiveTab === 'catalog' ? 'active' : ''}" onclick="switchAdminTab('catalog')">Каталог</div>
      <div class="admin-tab ${adminActiveTab === 'requests' ? 'active' : ''}" onclick="switchAdminTab('requests')">Запросы</div>
      <div class="admin-tab ${adminActiveTab === 'shifts' ? 'active' : ''}" onclick="switchAdminTab('shifts')">Смены</div>
      <div class="admin-tab ${adminActiveTab === 'users' ? 'active' : ''}" onclick="switchAdminTab('users')">Сотрудники</div>
      <div class="admin-tab ${adminActiveTab === 'holidays' ? 'active' : ''}" onclick="switchAdminTab('holidays')">Праздники</div>
      ${isSuperAdmin ? `<div class="admin-tab ${adminActiveTab === 'scale' ? 'active' : ''}" onclick="switchAdminTab('scale')">Шкала</div>` : ''}
    </div>
    <div id="adminContent"></div>
  </div>`;
}

function switchAdminTab(tab) {
  adminActiveTab = tab;
  renderApp();
  loadAdminTab(tab);
}

async function loadAdminTab(tab) {
  const content = document.getElementById('adminContent');
  if (!content) return;
  content.innerHTML = '<div class="loading">Загрузка...</div>';

  switch (tab) {
    case 'overview':
      await loadAdminOverview(content);
      break;
    case 'catalog':
      await loadAdminCatalog(content);
      break;
    case 'requests':
      await loadAdminRequests(content);
      break;
    case 'shifts':
      await loadAdminShifts(content);
      break;
    case 'users':
      await loadAdminUsers(content);
      break;
    case 'holidays':
      await loadAdminHolidays(content);
      break;
    case 'scale':
      await loadAdminScale(content);
      break;
  }
}

async function loadAdminOverview(content) {
  const [stats, allUsers] = await Promise.all([
    apiGet('/api/admin/stats'),
    apiGet('/api/admin/users')
  ]);
  allUsersList = allUsers || [];

  if (stats) {
    content.innerHTML = `
      <div style="padding: 16px;">
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-number">${stats.users_count || 0}</div><div class="stat-label">Пользователей</div></div>
          <div class="stat-card"><div class="stat-number">${stats.products_count || 0}</div><div class="stat-label">Товаров</div></div>
          <div class="stat-card"><div class="stat-number">${stats.categories_count || 0}</div><div class="stat-label">Категорий</div></div>
          <div class="stat-card"><div class="stat-number">${stats.carry_requests_count || 0}</div><div class="stat-label">Заявок на занос</div></div>
        </div>
        <div style="margin-top: 24px;">
          <h3 style="margin-bottom: 12px;">Сотрудники онлайн</h3>
          ${allUsers.filter(u => u.is_active).map(u => `<div style="padding: 8px 0; border-bottom: 1px solid var(--ios-border);">${u.login} - ${u.role === 'admin' ? 'Админ' : 'Сотрудник'}</div>`).join('')}
        </div>
      </div>`;
  }
}

async function loadAdminCatalog(content) {
  content.innerHTML = `
    <div style="padding: 16px;">
      <button class="btn btn-primary" onclick="triggerSync()" style="margin-bottom: 12px;">🔄 Синхронизировать каталог</button>
      <button class="btn btn-danger" onclick="showResetCarryModal()" style="margin-bottom: 12px;">↺ Сбросить заявки на занос</button>
      <button class="btn btn-secondary" onclick="showAddTodoModal()" style="margin-bottom: 12px;">+ Добавить задачу</button>
      <button class="btn btn-secondary" onclick="showCreateClaimModal()" style="margin-bottom: 12px;">+ Создать претензию</button>
    </div>
  `;
}

async function loadAdminRequests(content) {
  const requests = await apiGet('/api/profile/requests/all');
  if (!requests || requests.length === 0) {
    content.innerHTML = '<div class="empty-state">Нет запросов</div>';
    return;
  }

  content.innerHTML = `<div style="padding: 16px;">
    ${requests.map(r => {
      const typeText = r.request_type === 'vacation' ? 'Отпуск' : 'Аванс';
      const statusClass = r.status === 'pending' ? 'status-pending' : r.status === 'approved' ? 'status-approved' : 'status-rejected';
      const statusText = r.status === 'pending' ? 'Ожидает' : r.status === 'approved' ? 'Одобрено' : 'Отклонено';
      return `<div class="shift-history-item">
        <div><strong>${r.user_name}</strong> — ${typeText}</div>
        <div style="font-size: 13px; color: var(--ios-gray);">${r.description || ''}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
          <span class="claim-status ${statusClass}">${statusText}</span>
          <span style="font-size: 12px; color: var(--ios-gray);">${new Date(r.created_at).toLocaleDateString('ru-RU')}</span>
        </div>
        ${r.status === 'pending' ? `<div style="display: flex; gap: 8px; margin-top: 8px;">
          <button class="btn btn-success" style="padding: 4px 12px; font-size: 13px;" onclick="resolveRequest(${r.id}, 'approved')">Одобрить</button>
          <button class="btn btn-danger" style="padding: 4px 12px; font-size: 13px;" onclick="resolveRequest(${r.id}, 'rejected')">Отклонить</button>
        </div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

async function resolveRequest(requestId, status) {
  await apiPost(`/api/profile/requests/${requestId}/resolve`, { status });
  loadAdminTab('requests');
}

async function loadAdminShifts(content) {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const schedule = await apiGet(`/api/shift/schedule?date=${dateStr}`);
  
  let html = `<div style="padding: 16px;">
    <div style="display: flex; gap: 8px; margin-bottom: 16px; align-items: center;">
      <input type="date" id="shiftHistoryStart" class="form-input" style="width: auto;" value="${today.toISOString().slice(0, 10)}">
      <span>—</span>
      <input type="date" id="shiftHistoryEnd" class="form-input" style="width: auto;" value="${today.toISOString().slice(0, 10)}">
      <button class="btn btn-primary" onclick="loadShiftHistory()" style="padding: 8px 16px; font-size: 13px;">Показать</button>
    </div>`;
  
  if (schedule) {
    if (schedule.isDayOff) {
      html += `<div class="empty-state">${schedule.dayOffReason || 'Выходной'}</div>`;
    } else {
      html += `<h3 style="margin-bottom: 12px;">На работе (${schedule.shifts.length})</h3>`;
      
      if (schedule.shifts.length > 0) {
        html += `<table style="width: 100%; font-size: 13px; margin-bottom: 16px; border-collapse: collapse;">
          <thead><tr style="border-bottom: 1px solid var(--ios-border);">
            <th style="text-align: left; padding: 6px;">Сотрудник</th>
            <th style="text-align: center; padding: 6px;">Время</th>
            <th style="text-align: center; padding: 6px;">Статус</th>
            <th style="text-align: center; padding: 6px;">Действие</th>
          </tr></thead>
          <tbody>`;
        schedule.shifts.forEach(s => {
          const statusColor = s.status === 'on_time' ? 'var(--ios-green)' : s.status === 'late' ? 'var(--ios-orange)' : 'var(--ios-red)';
          html += `<tr style="border-bottom: 1px solid var(--ios-border2);">
            <td style="padding: 6px;">${s.user_name}</td>
            <td style="padding: 6px; text-align: center;">${s.start_time_yakutsk || '-'}</td>
            <td style="padding: 6px; text-align: center; color: ${statusColor}; font-weight: 600;">${s.status_text}</td>
            <td style="padding: 6px; text-align: center;">
              <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px;" onclick="showEditShiftModal(${s.user_id}, '${s.user_name}', '${s.date}', '${s.start_time_yakutsk}', '${s.status}')">✏️</button>
            </td>
          </tr>`;
        });
        html += `</tbody></table>`;
      }
      
      if (schedule.absent && schedule.absent.length > 0) {
        html += `<h3 style="margin-bottom: 12px;">Отсутствуют (${schedule.absent.length})</h3>`;
        html += `<table style="width: 100%; font-size: 13px; margin-bottom: 16px; border-collapse: collapse;">
          <thead><tr style="border-bottom: 1px solid var(--ios-border);">
            <th style="text-align: left; padding: 6px;">Сотрудник</th>
            <th style="text-align: center; padding: 6px;">Статус</th>
            <th style="text-align: center; padding: 6px;">Действие</th>
          </tr></thead>
          <tbody>`;
        schedule.absent.forEach(a => {
          html += `<tr style="border-bottom: 1px solid var(--ios-border2);">
            <td style="padding: 6px;">${a.user_name}</td>
            <td style="padding: 6px; text-align: center; color: var(--ios-red);">${a.status_text}</td>
            <td style="padding: 6px; text-align: center;">
              <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px;" onclick="setNoShow(${a.user_id})">Не выход</button>
            </td>
          </tr>`;
        });
        html += `</tbody></table>`;
      }
    }
  }
  
  html += `<div id="shiftHistoryTable"></div>`;
  html += `</div>`;
  content.innerHTML = html;
  
  // Загружаем историю за текущий период
  loadShiftHistory();
}

async function loadShiftHistory() {
  const startDate = document.getElementById('shiftHistoryStart')?.value;
  const endDate = document.getElementById('shiftHistoryEnd')?.value;
  if (!startDate || !endDate) return;
  
  const tableContainer = document.getElementById('shiftHistoryTable');
  if (!tableContainer) return;
  
  tableContainer.innerHTML = '<div class="loading">Загрузка...</div>';
  
  const data = await apiGet(`/api/shift/history?startDate=${startDate}&endDate=${endDate}`);
  shiftHistoryData = data || [];
  
  if (data.length === 0) {
    tableContainer.innerHTML = '<div class="empty-state">Нет данных за выбранный период</div>';
    return;
  }
  
  let html = `<div style="margin-top: 16px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h3>История смен</h3>
      <button class="btn btn-secondary" onclick="printShiftHistory()" style="padding: 4px 12px; font-size: 13px;">🖨️ Печать</button>
    </div>
    <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
      <thead><tr style="border-bottom: 2px solid var(--ios-border);">
        <th style="text-align: left; padding: 6px;">Дата</th>
        <th style="text-align: left; padding: 6px;">Сотрудник</th>
        <th style="text-align: center; padding: 6px;">Время (Якут.)</th>
        <th style="text-align: center; padding: 6px;">Статус</th>
      </tr></thead>
      <tbody>`;
  
  data.forEach(s => {
    const statusColor = s.status === 'on_time' ? 'var(--ios-green)' : s.status === 'late' ? 'var(--ios-orange)' : s.status === 'day_off' ? 'var(--ios-blue)' : 'var(--ios-red)';
    html += `<tr style="border-bottom: 1px solid var(--ios-border2);">
      <td style="padding: 6px;">${s.date}</td>
      <td style="padding: 6px;">${s.user_name}</td>
      <td style="padding: 6px; text-align: center;">${s.start_time_yakutsk || '-'}</td>
      <td style="padding: 6px; text-align: center; color: ${statusColor}; font-weight: 600;">${s.status_text || s.status}</td>
    </tr>`;
  });
  
  html += `</tbody></table></div>`;
  tableContainer.innerHTML = html;
}

function printShiftHistory() {
  const startDate = document.getElementById('shiftHistoryStart')?.value;
  const endDate = document.getElementById('shiftHistoryEnd')?.value;
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html><head><title>История смен</title>
    <style>body{font-family:Arial,sans-serif;padding:20px}h2{margin-bottom:5px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:6px;border-bottom:1px solid #ddd}th{border-bottom:2px solid #333}.on-time{color:green}.late{color:orange}.no-show{color:red}</style>
    </head><body>
    <h2>История смен</h2>
    <p style="color:#666">Период: ${startDate} — ${endDate}</p>
    <table>
      <thead><tr><th>Дата</th><th>Сотрудник</th><th>Время (Якут.)</th><th>Статус</th></tr></thead>
      <tbody>
        ${shiftHistoryData.map(s => {
          const cls = s.status === 'on_time' ? 'on-time' : s.status === 'late' ? 'late' : 'no-show';
          return `<tr><td>${s.date}</td><td>${s.user_name}</td><td>${s.start_time_yakutsk || '-'}</td><td class="${cls}">${s.status_text || s.status}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
    </body></html>
  `);
  printWindow.document.close();
  printWindow.print();
}

async function setNoShow(userId) {
  await apiPost('/api/shift/set-no-show', { userId });
  loadAdminTab('shifts');
}

function showEditShiftModal(userId, userName, date, currentTime, currentStatus) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'editShiftModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 350px;">
      <h3 class="modal-title">Изменить отметку</h3>
      <div style="margin-bottom: 12px; font-size: 14px;"><strong>${userName}</strong><br>${date}</div>
      <input type="time" id="editShiftTime" class="form-input" style="margin-bottom: 8px;" value="${currentTime || '09:00'}">
      <select id="editShiftStatus" class="form-input" style="margin-bottom: 16px;">
        <option value="on_time" ${currentStatus === 'on_time' ? 'selected' : ''}>Вовремя</option>
        <option value="late" ${currentStatus === 'late' ? 'selected' : ''}>Опоздание</option>
        <option value="no_show" ${currentStatus === 'no_show' ? 'selected' : ''}>Не выход</option>
      </select>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="document.getElementById('editShiftModal').remove()">Отмена</button>
        <button class="btn btn-primary" onclick="saveShiftEdit(${userId}, '${date}')">Сохранить</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function saveShiftEdit(userId, date) {
  const newTime = document.getElementById('editShiftTime').value;
  const newStatus = document.getElementById('editShiftStatus').value;
  await apiPost('/api/shift/update-time', { userId, date, newTime, newStatus });
  document.getElementById('editShiftModal').remove();
  loadAdminTab('shifts');
}

async function loadAdminUsers(content) {
  const users = await apiGet('/api/admin/users');
  if (!users) return;
  allUsersList = users;
  
  content.innerHTML = `<div style="padding: 16px;">
    <div style="display: flex; gap: 8px; margin-bottom: 16px;">
      <input type="text" id="newUserLogin" class="form-input" placeholder="Логин нового сотрудника" style="flex: 1;">
      <input type="password" id="newUserPassword" class="form-input" placeholder="Пароль" style="flex: 1;">
      <button class="btn btn-primary" onclick="createUser()">Создать</button>
    </div>
    ${users.map(u => `<div class="shift-history-item">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span><strong>${u.login}</strong> — ${u.role === 'admin' ? 'Админ' : 'Сотрудник'}</span>
        <div style="display: flex; gap: 8px;">
          ${u.role === 'staff' ? `<button class="icon-btn" onclick="toggleUserRole(${u.id})" title="Сделать админом">👑</button>` : ''}
          <button class="icon-btn" onclick="deleteUser(${u.id})" title="Удалить">✕</button>
        </div>
      </div>
    </div>`).join('')}
  </div>`;
}

async function createUser() { 
  const login = document.getElementById('newUserLogin').value; 
  const password = document.getElementById('newUserPassword').value; 
  if (!login || !password) { alert('Заполните все поля'); return; } 
  const result = await apiPost('/api/admin/create-user', { login, password }); 
  if (result.error) alert(result.error); else { 
    document.getElementById('newUserLogin').value = ''; 
    document.getElementById('newUserPassword').value = ''; 
    loadAdminTab('users'); 
  }
}

async function deleteUser(id) { 
  if (!confirm('Удалить пользователя?')) return; 
  await apiPost(`/api/admin/delete-user/${id}`, {}); 
  loadAdminTab('users'); 
}

async function toggleUserRole(id) { 
  await apiPost(`/api/admin/toggle-role/${id}`, {}); 
  loadAdminTab('users'); 
}

async function loadAdminHolidays(content) {
  const holidays = await apiGet('/api/shift/holidays');
  
  content.innerHTML = `<div style="padding: 16px;">
    <div style="display: flex; gap: 8px; margin-bottom: 16px;">
      <input type="date" id="newHolidayDate" class="form-input" style="flex: 1;">
      <input type="text" id="newHolidayName" class="form-input" placeholder="Название праздника" style="flex: 1;">
      <button class="btn btn-primary" onclick="addHoliday()">+</button>
    </div>
    ${(!holidays || holidays.length === 0) ? '<div class="empty-state">Нет праздников</div>' : holidays.map(h => `<div class="shift-history-item" style="display: flex; justify-content: space-between; align-items: center;">
      <span>${h.date} — <strong>${h.name}</strong></span>
      <button class="icon-btn" onclick="deleteHoliday(${h.id})">✕</button>
    </div>`).join('')}
  </div>`;
}

async function addHoliday() {
  const date = document.getElementById('newHolidayDate').value;
  const name = document.getElementById('newHolidayName').value;
  if (!date || !name) { alert('Заполните все поля'); return; }
  await apiPost('/api/shift/holidays', { date, name });
  loadAdminTab('holidays');
}

async function deleteHoliday(id) {
  if (!confirm('Удалить праздник?')) return;
  await apiDelete(`/api/shift/holidays/${id}`);
  loadAdminTab('holidays');
}

async function loadAdminScale(content) {
  const scale = await apiGet('/api/special-tasks/scale');
  complexityScale = scale || [];
  
  content.innerHTML = `<div style="padding: 16px;">
    <h3 style="margin-bottom: 12px;">Шкала сложности спец заданий</h3>
    ${scale.map(s => `<div class="shift-history-item" style="display: flex; justify-content: space-between; align-items: center;">
      <span><strong>${s.level}</strong> — ${s.label}</span>
      <input type="text" id="scaleLabel${s.level}" value="${s.label}" style="width: 200px; padding: 4px; border: 1px solid var(--ios-border); border-radius: 6px;">
      <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 12px;" onclick="updateScale(${s.level})">Сохранить</button>
    </div>`).join('')}
  </div>`;
}

async function updateScale(level) {
  const label = document.getElementById(`scaleLabel${level}`).value;
  await apiPut(`/api/special-tasks/scale/${level}`, { label });
  loadAdminTab('scale');
}

async function triggerSync() { 
  const result = await apiPost('/api/admin/sync', {}); 
  if (result.success) { alert('Синхронизация запуща'); } else { alert('Ошибка: ' + result.error); } 
}

async function showResetCarryModal() { 
  if (!confirm('Сбросить ВСЕ заявки на занос? Это действие нельзя отменить.')) return; 
  await apiPost('/api/carry/reset', {}); 
  alert('Все заявки сброшены'); 
}

function showAddTodoModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'addTodoModal';
  
  const userOptions = allUsersList.map(u => `<option value="${u.id}">${u.login}</option>`).join('');
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px;">
      <h3 class="modal-title">Добавить задачу</h3>
      <input type="date" id="todoDate" class="form-input" style="margin-bottom: 8px;" value="${new Date().toISOString().split('T')[0]}">
      <input type="text" id="todoTitle" class="form-input" placeholder="Название задачи" style="margin-bottom: 8px;">
      <textarea id="todoDescription" class="form-input" placeholder="Описание (необязательно)" style="margin-bottom: 8px; min-height: 60px;"></textarea>
      <div style="margin-bottom: 16px;">
        <label style="font-size: 13px; color: var(--ios-gray); display: block; margin-bottom: 4px;">Назначить сотрудников (не выбирайте для общей задачи)</label>
        <select id="todoAssignees" class="form-input" multiple size="5" style="height: auto;">
          ${userOptions}
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="document.getElementById('addTodoModal').remove()">Отмена</button>
        <button class="btn btn-primary" onclick="createTodo()">Добавить</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function createTodo() {
  const date = document.getElementById('todoDate').value;
  const title = document.getElementById('todoTitle').value;
  const description = document.getElementById('todoDescription').value;
  const selectEl = document.getElementById('todoAssignees');
  const assigneeIds = Array.from(selectEl.selectedOptions).map(o => parseInt(o.value));
  
  if (!date || !title) { alert('Заполните дату и название'); return; }
  
  await apiPost('/api/calendar/todos', { date, title, description, assigneeIds });
  document.getElementById('addTodoModal').remove();
  loadAdminTab('catalog');
}

function showCreateClaimModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'createClaimModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px;">
      <h3 class="modal-title">Создать претензию</h3>
      <input type="text" id="claimCheckNumber" class="form-input" placeholder="Номер чека" style="margin-bottom: 8px;">
      <input type="text" id="claimPurchaseTime" class="form-input" placeholder="Время покупки" style="margin-bottom: 8px;">
      <input type="text" id="claimOrderInfo" class="form-input" placeholder="Заказ / Сборка" style="margin-bottom: 8px;">
      <textarea id="claimMissingProducts" class="form-input" placeholder="Каких товаров нет" style="margin-bottom: 8px; min-height: 60px;"></textarea>
      <textarea id="claimText" class="form-input" placeholder="Суть претензии *" style="margin-bottom: 8px; min-height: 80px;"></textarea>
      <input type="file" id="claimAttachment" accept="image/*,video/*,.pdf" style="margin-bottom: 16px;">
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="document.getElementById('createClaimModal').remove()">Отмена</button>
        <button class="btn btn-primary" onclick="createClaim()">Создать</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function createClaim() {
  const checkNumber = document.getElementById('claimCheckNumber').value;
  const purchaseTime = document.getElementById('claimPurchaseTime').value;
  const orderInfo = document.getElementById('claimOrderInfo').value;
  const missingProducts = document.getElementById('claimMissingProducts').value;
  const claimText = document.getElementById('claimText').value;
  
  if (!claimText) { alert('Укажите суть претензии'); return; }
  
  const payload = {
    checkNumber,
    purchaseTime,
    orderInfo,
    missingProducts,
    claimText
  };
  
  // Handle file upload
  const fileInput = document.getElementById('claimAttachment');
  if (fileInput && fileInput.files[0]) {
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async function(e) {
      payload.attachmentData = {
        fileData: e.target.result,
        fileType: file.type,
        fileName: file.name
      };
      const result = await apiPost('/api/claims/create', payload);
      if (result.success) {
        document.getElementById('createClaimModal').remove();
        alert('Претензия создана');
      } else {
        alert(result.error || 'Ошибка');
      }
    };
    reader.readAsDataURL(file);
  } else {
    const result = await apiPost('/api/claims/create', payload);
    if (result.success) {
      document.getElementById('createClaimModal').remove();
      alert('Претензия создана');
    } else {
      alert(result.error || 'Ошибка');
    }
  }
}


// ===== ПРОВЕРКА СРОКА ГОДНОСТИ =====

async function showExpiryCheck() {
  currentView = 'expiry-check'; renderApp();
  await loadExpiryCheckData();
}

async function loadExpiryCheckData() {
  const products = await apiGet('/api/expiry-check/expiring-soon');
  const list = document.getElementById('expiryList');
  if (!list) return;
  
  if (!products || products.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div>Нет товаров с истекающим сроком</div>';
    return;
  }
  
  // Группируем по категориям для отображения
  let currentCategory = null;
  let html = '';
  
  products.forEach(p => {
    if (p.category_name !== currentCategory) {
      currentCategory = p.category_name;
      html += `<div style="padding: 8px 16px; background: var(--ios-bg); color: var(--ios-blue); font-weight: 600; font-size: 14px; margin-top: 8px; position: sticky; top: 0; z-index: 5;">${p.category_name}</div>`;
    }
    
    const expiryFormatted = formatExpiryDate(p.expiry_date);
    const daysUntil = calculateDaysUntil(p.expiry_date);
    const urgencyColor = daysUntil <= 7 ? 'var(--ios-red)' : daysUntil <= 30 ? 'var(--ios-orange)' : 'var(--ios-yellow)';
    const isChecked = p.is_confirmed;
    
    html += `<div class="expiry-item ${isChecked ? 'confirmed' : ''}" data-product-id="${p.id}">
      <div class="expiry-info">
        <div style="font-weight: 600;">${p.name}</div>
        <div style="font-size: 13px; color: var(--ios-gray);">${p.vendor_code || ''}</div>
        <div style="font-size: 13px; color: ${urgencyColor}; font-weight: 600;">
          Срок: ${expiryFormatted} (${daysUntil} дн.)
        </div>
      </div>
      <div class="expiry-actions">
        <button class="btn btn-secondary" style="padding: 4px 12px; font-size: 12px;" onclick="openExpiryModal(${p.id}, '${p.name.replace(/'/g, "\\'")}', '${p.expiry_date || ''}')">
          ${isChecked ? 'Изменить' : 'Проверить'}
        </button>
      </div>
    </div>`;
  });
  
  list.innerHTML = html;
}

function calculateDaysUntil(expiryDate) {
  if (!expiryDate) return 0;
  const parts = expiryDate.split('-');
  if (parts.length !== 3) return 0;
  const expiry = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const now = new Date();
  const diffTime = expiry - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function renderExpiryCheck() {
  return `<div class="main-layout">
    <div class="header">
      <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
      <div class="header-title">Проверка срока годности</div>
      <div></div>
    </div>
    <div style="padding: 8px 16px; background: var(--ios-card); text-align: center; font-size: 13px; color: var(--ios-gray);">
      Показаны товары со сроком &lt; 60 дней
    </div>
    <div id="expiryList"><div class="loading">Загрузка...</div></div>
  </div>`;
}

function openExpiryModal(productId, productName, currentExpiry) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'expiryCheckModal';
  
  const expiryFormatted = formatExpiryDate(currentExpiry);
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 380px;">
      <h3 class="modal-title" style="font-size: 14px;">${productName}</h3>
      <div style="margin-bottom: 12px; color: var(--ios-gray); font-size: 13px;">
        Текущий срок: <strong>${expiryFormatted || 'не указан'}</strong>
      </div>
      <div style="margin-bottom: 12px;">
        <label style="font-size: 13px; color: var(--ios-gray); display: block; margin-bottom: 4px;">Новый срок годности (или подтвердите текущий)</label>
        <input type="text" id="newExpiryInput" class="form-input" placeholder="Например: 31.12.25 или 2025-12-31" style="margin-bottom: 8px;" value="${expiryFormatted || ''}">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="document.getElementById('expiryCheckModal').remove()">Отмена</button>
        <button class="btn btn-primary" onclick="confirmExpiry(${productId})">✓ Подтвердить</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function confirmExpiry(productId) {
  const newExpiry = document.getElementById('newExpiryInput').value;
  await apiPost('/api/expiry-check/check', { productId, newExpiry, isConfirmed: true });
  document.getElementById('expiryCheckModal').remove();
  loadExpiryCheckData();
}


// ===== СПЕЦ ЗАДАНИЯ =====

async function showSpecialTasks() {
  currentView = 'special-tasks'; renderApp();
  await loadSpecialTasks();
}

async function loadSpecialTasks() {
  const [myTasks, scale] = await Promise.all([
    apiGet('/api/special-tasks/my'),
    apiGet('/api/special-tasks/scale')
  ]);
  complexityScale = scale || [];
  
  const list = document.getElementById('specialTasksList');
  if (!list) return;
  
  if (!myTasks || myTasks.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">⭐</div>Нет спец заданий</div>';
    return;
  }
  
  list.innerHTML = myTasks.map(t => {
    const scaleLabel = complexityScale.find(s => s.level === t.complexity)?.label || t.complexity;
    const statusClass = t.status === 'approved' ? 'status-approved' : t.status === 'rejected' ? 'status-rejected' : 'status-pending';
    const statusText = t.status === 'approved' ? 'Одобрено' : t.status === 'rejected' ? 'Отклонено' : 'На проверке';
    
    return `<div class="special-task-item">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
        <span class="claim-status ${statusClass}">${statusText}</span>
        <span style="font-size: 12px; color: var(--ios-gray);">${new Date(t.created_at).toLocaleDateString('ru-RU')}</span>
      </div>
      <div style="margin-bottom: 8px;">${t.description}</div>
      <div style="font-size: 13px; color: var(--ios-blue); margin-bottom: 8px;">Сложность: ${t.complexity}/5 — ${scaleLabel}</div>
      ${t.photo_path ? `<img src="${t.photo_path}" style="max-width: 100%; max-height: 200px; border-radius: 8px; margin-bottom: 8px; object-fit: cover;">` : ''}
      ${t.admin_comment ? `<div style="font-size: 13px; color: var(--ios-orange); background: rgba(255,149,0,0.1); padding: 8px; border-radius: 6px;">Комментарий: ${t.admin_comment}</div>` : ''}
    </div>`;
  }).join('');
}

function renderSpecialTasks() {
  return `<div class="main-layout">
    <div class="header">
      <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
      <div class="header-title">Спец задания</div>
      <div></div>
    </div>
    <div style="padding: 16px;">
      <button class="btn btn-primary" onclick="showCreateSpecialTaskModal()" style="width: 100%; margin-bottom: 16px;">+ Новое задание</button>
    </div>
    <div id="specialTasksList"><div class="loading">Загрузка...</div></div>
  </div>`;
}

function showCreateSpecialTaskModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'createSpecialTaskModal';
  
  const scaleOptions = complexityScale.map(s => `<option value="${s.level}">${s.level} — ${s.label}</option>`).join('');
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px;">
      <h3 class="modal-title">Новое спец задание</h3>
      <textarea id="stDescription" class="form-input" placeholder="Опишите выполненную задачу..." style="margin-bottom: 8px; min-height: 80px;"></textarea>
      <div style="margin-bottom: 8px;">
        <label style="font-size: 13px; color: var(--ios-gray); display: block; margin-bottom: 4px;">Сложность</label>
        <select id="stComplexity" class="form-input">
          ${scaleOptions}
        </select>
      </div>
      <div style="margin-bottom: 16px;">
        <label style="font-size: 13px; color: var(--ios-gray); display: block; margin-bottom: 4px;">Фото работы (необязательно)</label>
        <input type="file" id="stPhoto" accept="image/*" style="font-size: 13px;">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="document.getElementById('createSpecialTaskModal').remove()">Отмена</button>
        <button class="btn btn-primary" onclick="createSpecialTask()">Отправить</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function createSpecialTask() {
  const description = document.getElementById('stDescription').value;
  const complexity = parseInt(document.getElementById('stComplexity').value);
  
  if (!description) { alert('Опишите задачу'); return; }
  
  const result = await apiPost('/api/special-tasks/', { description, complexity });
  if (result.success) {
    // Upload photo if exists
    const fileInput = document.getElementById('stPhoto');
    if (fileInput && fileInput.files[0]) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = async function(e) {
        await apiPost(`/api/special-tasks/${result.id}/photo`, {
          fileData: e.target.result,
          fileType: file.type,
          fileName: file.name
        });
        document.getElementById('createSpecialTaskModal').remove();
        loadSpecialTasks();
      };
      reader.readAsDataURL(file);
    } else {
      document.getElementById('createSpecialTaskModal').remove();
      loadSpecialTasks();
    }
  } else {
    alert(result.error || 'Ошибка');
  }
}


// ===== ЛИЧНЫЙ КАБИНЕТ =====

async function showProfile() {
  currentView = 'profile'; renderApp();
  await loadProfileData();
}

async function loadProfileData() {
  const [profile, requests, shifts, documents, instructions] = await Promise.all([
    apiGet('/api/profile/'),
    apiGet('/api/profile/requests'),
    apiGet('/api/profile/shifts'),
    apiGet('/api/profile/documents'),
    apiGet('/api/profile/instructions')
  ]);
  
  // График смен
  const shiftsContainer = document.getElementById('profileShifts');
  if (shiftsContainer) {
    if (!shifts || shifts.length === 0) {
      shiftsContainer.innerHTML = '<div class="empty-state">Нет данных о сменах</div>';
    } else {
      shiftsContainer.innerHTML = `<table style="width: 100%; font-size: 13px;">
        <thead><tr style="border-bottom: 1px solid var(--ios-border);">
          <th style="text-align: left; padding: 4px;">Дата</th>
          <th style="text-align: center; padding: 4px;">Время</th>
          <th style="text-align: center; padding: 4px;">Статус</th>
        </tr></thead>
        <tbody>
          ${shifts.slice(0, 30).map(s => {
            const statusColor = s.status === 'on_time' ? 'var(--ios-green)' : s.status === 'late' ? 'var(--ios-orange)' : 'var(--ios-red)';
            const statusText = s.status === 'on_time' ? 'Вовремя' : s.status === 'late' ? 'Опоздание' : 'Не выход';
            return `<tr style="border-bottom: 1px solid var(--ios-border2);">
              <td style="padding: 4px;">${s.date}</td>
              <td style="padding: 4px; text-align: center;">${s.start_time_yakutsk || '-'}</td>
              <td style="padding: 4px; text-align: center; color: ${statusColor}; font-size: 12px;">${statusText}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
    }
  }
  
  // Мои запросы
  const requestsContainer = document.getElementById('profileRequests');
  if (requestsContainer) {
    if (!requests || requests.length === 0) {
      requestsContainer.innerHTML = '<div class="empty-state">Нет запросов</div>';
    } else {
      requestsContainer.innerHTML = requests.map(r => {
        const typeText = r.request_type === 'vacation' ? 'Отпуск' : 'Аванс';
        const statusClass = r.status === 'pending' ? 'status-pending' : r.status === 'approved' ? 'status-approved' : 'status-rejected';
        const statusText = r.status === 'pending' ? 'Ожидает' : r.status === 'approved' ? 'Одобрено' : 'Отклонено';
        return `<div class="shift-history-item">
          <div style="display: flex; justify-content: space-between;">
            <span><strong>${typeText}</strong></span>
            <span class="claim-status ${statusClass}">${statusText}</span>
          </div>
          <div style="font-size: 12px; color: var(--ios-gray);">${r.description || ''}</div>
        </div>`;
      }).join('');
    }
  }
  
  // Инструкции
  const instrContainer = document.getElementById('profileInstructions');
  if (instrContainer) {
    if (!instructions || instructions.length === 0) {
      instrContainer.innerHTML = '<div class="empty-state">Нет инструкций</div>';
    } else {
      instrContainer.innerHTML = instructions.map(i => `<div class="shift-history-item">
        <div style="font-weight: 600;">${i.title}</div>
        ${i.content ? `<div style="font-size: 13px; color: var(--ios-gray); margin-top: 4px;">${i.content}</div>` : ''}
      </div>`).join('');
    }
  }
  
  // Документы
  const docsContainer = document.getElementById('profileDocuments');
  if (docsContainer) {
    if (!documents || documents.length === 0) {
      docsContainer.innerHTML = '<div class="empty-state">Нет загруженных документов</div>';
    } else {
      docsContainer.innerHTML = documents.map(d => `<div class="shift-history-item" style="display: flex; justify-content: space-between; align-items: center;">
        <span>📄 ${d.title}</span>
        <button class="icon-btn" onclick="deleteDocument(${d.id})">✕</button>
      </div>`).join('');
    }
  }
  
  // Аватар
  const avatarContainer = document.getElementById('profileAvatar');
  if (avatarContainer && profile) {
    const avatarPath = profile.profile?.avatar_path;
    avatarContainer.innerHTML = avatarPath 
      ? `<img src="${avatarPath}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;">`
      : `<div style="width: 80px; height: 80px; border-radius: 50%; background: var(--ios-blue); display: flex; align-items: center; justify-content: center; color: white; font-size: 28px;">${(profile.login || 'U')[0].toUpperCase()}</div>`;
  }
  
  // Инфо
  const infoContainer = document.getElementById('profileInfo');
  if (infoContainer && profile) {
    infoContainer.innerHTML = `
      <div style="margin-bottom: 8px;"><strong>Логин:</strong> ${profile.login}</div>
      <div style="margin-bottom: 8px;"><strong>Роль:</strong> ${profile.role === 'admin' ? 'Администратор' : 'Сотрудник'}</div>
      ${profile.profile?.phone ? `<div style="margin-bottom: 8px;"><strong>Телефон:</strong> ${profile.profile.phone}</div>` : ''}
      ${profile.profile?.email ? `<div style="margin-bottom: 8px;"><strong>Email:</strong> ${profile.profile.email}</div>` : ''}
      ${profile.profile?.bio ? `<div style="margin-bottom: 8px;"><strong>О себе:</strong> ${profile.profile.bio}</div>` : ''}
    `;
  }
}

function renderProfile() {
  const tabs = [
    { id: 'info', label: 'Профиль' },
    { id: 'shifts', label: 'График' },
    { id: 'instructions', label: 'Инструкции' },
    { id: 'documents', label: 'Документы' },
    { id: 'requests', label: 'Мои запросы' },
  ];
  
  return `<div class="main-layout">
    <div class="header">
      <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
      <div class="header-title">Личный кабинет</div>
      <div></div>
    </div>
    <div style="padding: 16px; text-align: center;">
      <div id="profileAvatar" style="margin-bottom: 12px;"></div>
      <div style="margin-bottom: 8px;">
        <input type="file" id="avatarUpload" accept="image/*" style="display: none;" onchange="uploadAvatar(this)">
        <button class="btn btn-secondary" style="padding: 4px 12px; font-size: 13px;" onclick="document.getElementById('avatarUpload').click()">Сменить фото</button>
      </div>
    </div>
    <div class="admin-nav" style="padding: 0 8px;">
      ${tabs.map(t => `<div class="admin-tab ${currentProfileTab === t.id ? 'active' : ''}" onclick="switchProfileTab('${t.id}')">${t.label}</div>`).join('')}
    </div>
    <div id="profileContent" style="padding: 16px;">
      <div id="profileInfo" style="${currentProfileTab === 'info' ? '' : 'display: none;'}"></div>
      <div id="profileShifts" style="${currentProfileTab === 'shifts' ? '' : 'display: none;'}"></div>
      <div id="profileInstructions" style="${currentProfileTab === 'instructions' ? '' : 'display: none;'}"></div>
      <div id="profileDocuments" style="${currentProfileTab === 'documents' ? '' : 'display: none;'}"></div>
      <div id="profileRequests" style="${currentProfileTab === 'requests' ? '' : 'display: none;'}"></div>
    </div>
    <div style="padding: 16px; border-top: 1px solid var(--ios-border);">
      <button class="btn btn-primary" onclick="showRequestModal('vacation')" style="width: 100%; margin-bottom: 8px;">🌴 Запросить отпуск</button>
      <button class="btn btn-secondary" onclick="showRequestModal('advance')" style="width: 100%;">💰 Запросить аванс</button>
    </div>
    <div style="padding: 16px; text-align: center;">
      <button class="btn btn-secondary" style="padding: 4px 12px; font-size: 13px;" onclick="showProfileEditModal()">✏️ Редактировать профиль</button>
    </div>
  </div>`;
}

function switchProfileTab(tab) {
  currentProfileTab = tab;
  renderApp();
  loadProfileData();
}

async function uploadAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async function(e) {
    await apiPost('/api/profile/avatar', {
      fileData: e.target.result,
      fileName: file.name
    });
    loadProfileData();
  };
  reader.readAsDataURL(file);
}

function showRequestModal(type) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'requestModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 350px;">
      <h3 class="modal-title">${type === 'vacation' ? 'Запрос отпуска' : 'Запрос аванса'}</h3>
      <textarea id="requestDescription" class="form-input" placeholder="Описание (необязательно)" style="min-height: 80px; margin-bottom: 16px;"></textarea>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="document.getElementById('requestModal').remove()">Отмена</button>
        <button class="btn btn-primary" onclick="createRequest('${type}')">Отправить</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function createRequest(type) {
  const description = document.getElementById('requestDescription').value;
  await apiPost('/api/profile/requests', { requestType: type, description });
  document.getElementById('requestModal').remove();
  loadProfileData();
}

async function deleteDocument(docId) {
  if (!confirm('Удалить документ?')) return;
  await apiDelete(`/api/profile/documents/${docId}`);
  loadProfileData();
}

function showProfileEditModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'editProfileModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 350px;">
      <h3 class="modal-title">Редактировать профиль</h3>
      <input type="text" id="editPhone" class="form-input" placeholder="Телефон" style="margin-bottom: 8px;">
      <input type="email" id="editEmail" class="form-input" placeholder="Email" style="margin-bottom: 8px;">
      <textarea id="editBio" class="form-input" placeholder="О себе" style="margin-bottom: 8px; min-height: 60px;"></textarea>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="document.getElementById('editProfileModal').remove()">Отмена</button>
        <button class="btn btn-primary" onclick="saveProfile()">Сохранить</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function saveProfile() {
  const phone = document.getElementById('editPhone').value;
  const email = document.getElementById('editEmail').value;
  const bio = document.getElementById('editBio').value;
  
  await apiPut('/api/profile/', { phone, email, bio });
  document.getElementById('editProfileModal').remove();
  loadProfileData();
}


// ===== ЧАТ =====

async function showChat() {
  currentView = 'chat'; renderApp();
  await loadChatMessages();
}

async function loadChatMessages() {
  const messages = await apiGet('/api/profile/chat');
  chatMessages = messages || [];
  
  const container = document.getElementById('chatMessages');
  if (!container) return;
  
  if (chatMessages.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет сообщений</div>';
  } else {
    container.innerHTML = chatMessages.map(m => {
      const isMe = m.user_id === currentUser.id;
      return `<div class="chat-message ${isMe ? 'sent' : 'received'}">
        ${!isMe ? `<div style="font-size: 11px; color: var(--ios-blue); margin-bottom: 2px;">${m.user_name}</div>` : ''}
        <div>${m.message}</div>
        <div style="font-size: 11px; color: var(--ios-gray3); margin-top: 4px; text-align: right;">${new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>`;
    }).join('');
  }
  
  container.scrollTop = container.scrollHeight;
}

function renderChat() {
  return `<div class="main-layout">
    <div class="header">
      <button class="back-btn" onclick="showMainMenu()">‹ Назад</button>
      <div class="header-title">Общий чат</div>
      <div></div>
    </div>
    <div id="chatMessages" style="flex: 1; overflow-y: auto; padding: 16px;"></div>
    <div style="padding: 12px 16px; border-top: 1px solid var(--ios-border); display: flex; gap: 8px; background: var(--ios-bg);">
      <input type="text" id="chatInput" class="form-input" placeholder="Сообщение..." style="flex: 1; margin-bottom: 0;" onkeypress="if(event.key==='Enter') sendChatMessage()">
      <button class="btn btn-primary" onclick="sendChatMessage()" style="padding: 8px 16px;">➤</button>
    </div>
  </div>`;
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;
  
  input.value = '';
  await apiPost('/api/profile/chat', { message });
  await loadChatMessages();
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', init);
