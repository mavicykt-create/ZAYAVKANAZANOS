const app = document.getElementById('app');
const state = {
  me: null,
  current: 'home',
  categories: [],
  carryCategories: [],
  carryItems: [],
  priceGroups: [],
  priceItems: [],
  pricePage: null,
  productCheckItems: [],
  calendar: { dates: [], items: [] },
  admin: { overview: null, users: [], locks: [], leaderboard: [], problems: [] },
  orderPrint: null,
  syncStatus: null,
  installPrompt: null
};

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.installPrompt = e;
  render();
});

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (res.status === 401) {
    state.me = null;
    render();
    throw new Error('auth required');
  }
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.message || 'Ошибка');
  return data;
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (s) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[s]));
}

function layout(title, body, bottom = '') {
  return `
    <div class="topbar">
      <div class="topbar-inner">
        <div class="brand">${escapeHtml(title)}</div>
        ${state.me ? `<div class="small">${escapeHtml(state.me.login)} · ${state.me.role}</div>` : ''}
        ${state.me ? `<button class="btn btn-ghost" onclick="logout()">Выйти</button>` : ''}
      </div>
    </div>
    <div class="screen">${body}</div>
    ${bottom ? `<div class="bottom-bar">${bottom}</div>` : ''}
  `;
}

function renderLogin(error = '') {
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login-card" onsubmit="submitLogin(event)">
        <h1 class="login-title">ZAN 1.1</h1>
        <p class="login-sub">Вход</p>
        ${error ? `<div class="notice" style="margin-bottom:12px">${escapeHtml(error)}</div>` : ''}
        <input class="input" name="login" placeholder="Логин" autocomplete="username" required />
        <input class="input" name="password" type="password" placeholder="Пароль" autocomplete="current-password" required />
        <button class="btn" type="submit" style="width:100%">Войти</button>
      </form>
    </div>
  `;
}

function homeView() {
  return layout('ZAN 1.1', `
    <div class="grid-menu">
      <button class="menu-btn" onclick="go('carry-categories')"><div class="title">Заявка на занос</div><div class="small">Категории и сборка заявки</div></button>
      <button class="menu-btn" onclick="loadPricePages()"><div class="title">Проверка ценников</div><div class="small">Страницы по 50 товаров</div></button>
      <button class="menu-btn" onclick="loadProductCheck()"><div class="title">Проверка товара</div><div class="small">Без штрих-кода</div></button>
      <button class="menu-btn" onclick="loadCalendar()"><div class="title">Календарь недели</div><div class="small">Новости, задачи, дела</div></button>
      <button class="menu-btn" onclick="installApp()"><div class="title">Установить на мобильный</div><div class="small">PWA</div></button>
      ${state.me?.role === 'admin' ? `<button class="menu-btn" onclick="loadAdmin()"><div class="title">Админка</div><div class="small">Обзор, сотрудники, sync</div></button>` : ''}
    </div>
  `);
}

function carryCategoriesView() {
  const body = `
    <div class="section-title">Заявка на занос</div>
    <div class="section-sub">Сборка заявки всегда доступна. Блокировок нет.</div>
    <div class="list">
      ${state.carryCategories.map(c => `
        <button class="card category-item" onclick="loadCarryCategory(${c.id})">
          <div>
            <div><strong>${escapeHtml(c.name)}</strong></div>
            <div class="small">Товаров: ${c.item_count}</div>
          </div>
          <div class="badge">${c.total_qty || 0}</div>
        </button>
      `).join('')}
    </div>
  `;
  const bottom = `
    <div class="row">
      <button class="btn" style="flex:1" onclick="loadOrderAssembly()">Сборка заявки</button>
      <button class="btn btn-ghost" onclick="go('home')">Назад</button>
    </div>
  `;
  return layout('Заявка на занос', body, bottom);
}

function carryCategoryView() {
  const currentCategory = state.categories.find(x => x.id === Number(state.carryCategoryId));
  const body = `
    <div class="section-title">${escapeHtml(currentCategory?.name || '')}</div>
    <div class="catalog-grid">
      ${state.carryItems.map(item => `
        <div class="product-card" onclick="carryIncrement(${item.id})">
          <button class="minus-circle ${item.quantity > 0 ? '' : 'hidden'}" onclick="event.stopPropagation();carryDecrement(${item.id})">−</button>
          ${item.quantity > 0 ? `<div class="qty-badge">${item.quantity}</div>` : ''}
          <div class="pimg">${item.picture_url ? `<img src="${item.picture_url}" loading="lazy" decoding="async" />` : ''}</div>
          <div class="pname">${escapeHtml(item.name)}</div>
          <div class="pcode">${escapeHtml(item.vendor_code || '')}</div>
        </div>
      `).join('')}
    </div>
  `;
  const total = state.carryItems.reduce((s, x) => s + (x.quantity || 0), 0);
  const bottom = `
    <div class="row">
      <div class="chip">Штук: ${total}</div>
      <button class="btn btn-yellow" style="flex:1" onclick="confirmCarryCategory(${state.carryCategoryId})">Подтвердить заявку категории</button>
      <button class="btn btn-ghost" onclick="loadCarryCategories()">Назад</button>
    </div>
  `;
  return layout(currentCategory?.name || 'Категория', body, bottom);
}

function orderAssemblyView() {
  const categories = state.orderPrint?.categories || [];
  const body = `
    <div class="section-title">Сборка заявки</div>
    <div class="section-sub">${escapeHtml((state.orderPrint?.date || '') + ' ' + (state.orderPrint?.time || ''))}</div>
    ${categories.length ? categories.map(group => `
      <div class="card" style="margin-bottom:10px">
        <div style="font-weight:800;margin-bottom:8px">${escapeHtml(group.category)}</div>
        <div class="table">
          ${group.items.map(it => `
            <div class="table-row">
              <div class="ellipsis">${escapeHtml(it.name)}</div>
              <div class="small">${escapeHtml(it.vendor_code || '')}</div>
              <div><strong>${it.quantity}</strong></div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('') : `<div class="notice">Пока нет выбранных товаров.</div>`}
  `;
  const bottom = `
    <div class="row">
      <button class="btn btn-green" style="flex:1" onclick="completeOrder()">Заявка собрана полностью</button>
      <button class="btn btn-ghost" onclick="loadCarryCategories()">Назад</button>
    </div>
  `;
  return layout('Сборка заявки', body, bottom);
}

function pricePagesView() {
  const body = `
    <div class="section-title">Проверка ценников</div>
    <div class="section-sub">На стартовом экране только страницы.</div>
    ${state.priceGroups.map(group => `
      <div class="card" style="margin-bottom:10px">
        <div style="font-weight:800;margin-bottom:8px">${escapeHtml(group.category.name)}</div>
        <div class="chips">
          ${group.pages.map(p => `
            <button class="chip ${p.locked_by_login && p.locked_by_login !== state.me.login ? 'tag-red' : ''}" onclick="openPricePage(${group.category.id}, ${p.page_number})">
              Страница ${p.page_number}${p.locked_by_login ? ` · ${escapeHtml(p.locked_by_login)}` : ''}
            </button>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;
  return layout('Проверка ценников', body, `<button class="btn btn-ghost" onclick="go('home')">Назад</button>`);
}

function pricePageView() {
  const body = `
    <div class="section-title">Страница ${state.pricePage.pageNumber}</div>
    <div class="list">
      ${state.priceItems.map(item => `
        <div class="card">
          <div class="item-row">
            <div class="thumb">${item.picture_url ? `<img src="${item.picture_url}" loading="lazy" decoding="async" />` : ''}</div>
            <div class="grow">
              <div style="font-weight:800">${escapeHtml(item.name)}</div>
              <div class="small">${escapeHtml(item.vendor_code || '')}</div>
            </div>
          </div>
          <div class="row" style="margin-top:10px">
            <button class="toggle-red ${item.status_problem ? 'active' : ''}" onclick="togglePriceField(${item.id}, 'status_problem')">Проблема</button>
            <button class="toggle-yellow ${item.status_price ? 'active' : ''}" onclick="togglePriceField(${item.id}, 'status_price')">Ценник</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  const bottom = `
    <div class="row">
      <button class="btn btn-yellow" onclick="printPriceCheck()">Печать</button>
      <button class="btn btn-green" style="flex:1" onclick="closePricePage(true)">Готово</button>
      <button class="btn btn-ghost" onclick="closePricePage(false)">Назад</button>
    </div>
  `;
  return layout('Проверка ценников', body, bottom);
}

function productCheckView() {
  const body = `
    <div class="section-title">Проверка товара</div>
    <div class="list">
      ${state.productCheckItems.map(item => `
        <div class="card item-row">
          <div class="grow">
            <div style="font-weight:800">${escapeHtml(item.name)}</div>
            <div class="small">${escapeHtml(item.category_name)} · ${escapeHtml(item.vendor_code || '')}</div>
          </div>
          <button class="btn btn-red" onclick="hideProductCheck(${item.id})">−</button>
        </div>
      `).join('') || '<div class="notice">Товаров без штрих-кода нет.</div>'}
    </div>
  `;
  return layout('Проверка товара', body, `<button class="btn btn-ghost" onclick="go('home')">Назад</button>`);
}

function calendarView() {
  const itemsByDate = {};
  (state.calendar.items || []).forEach(x => {
    (itemsByDate[x.date] ||= []).push(x);
  });
  const body = `
    <div class="section-title">Календарь недели</div>
    <div class="list">
      ${state.calendar.dates.map(date => `
        <div class="card">
          <div class="calendar-day">
            <div><strong>${new Date(date).toLocaleDateString('ru-RU', { weekday:'short', day:'2-digit', month:'2-digit' })}</strong></div>
            ${state.me.role === 'admin' ? `<button class="btn btn-ghost" onclick="openCalendarForm('${date}')">Добавить</button>` : ''}
          </div>
          <div class="hr"></div>
          ${(itemsByDate[date] || []).map(item => `
            <div class="card" style="padding:10px;margin-bottom:8px">
              <div style="font-weight:800">${escapeHtml(item.title)}</div>
              <div class="small" style="margin-top:4px">${escapeHtml(item.text)}</div>
              ${state.me.role === 'admin' ? `<div class="row" style="margin-top:8px"><button class="btn btn-ghost" onclick='editCalendarItem(${item.id})'>Изменить</button><button class="btn btn-red" onclick="deleteCalendarItem(${item.id})">Удалить</button></div>` : ''}
            </div>
          `).join('') || '<div class="small">Пусто</div>'}
        </div>
      `).join('')}
    </div>
  `;
  return layout('Календарь недели', body, `<button class="btn btn-ghost" onclick="go('home')">Назад</button>`);
}

function adminView() {
  const ov = state.admin.overview || {};
  const body = `
    <div class="section-title">Админка</div>
    <div class="list">
      <div class="card">
        <div class="admin-item"><strong>Сотрудники онлайн</strong><span>${ov.online_staff ?? 0}</span></div>
        <div class="admin-item"><strong>Товаров</strong><span>${ov.products ?? 0}</span></div>
        <div class="admin-item"><strong>Без штрих-кода</strong><span>${ov.no_barcode ?? 0}</span></div>
        <div class="hr"></div>
        <div><strong>Sync</strong></div>
        <div class="small">${escapeHtml(ov.sync_status?.stage || '')} · ${escapeHtml(ov.sync_status?.message || '')}</div>
        <div class="progress" style="margin-top:8px"><div class="progress-bar" style="width:${ov.sync_status?.percent || 0}%"></div></div>
        <div class="row wrap" style="margin-top:10px">
          <button class="btn" onclick="runSync()">Обновить каталог</button>
          <button class="btn btn-ghost" onclick="resetSync()">Сбросить обновление</button>
          <button class="btn btn-ghost" onclick="clearImageCache()">Очистка кэша</button>
        </div>
      </div>

      <div class="card">
        <div class="row" style="justify-content:space-between"><strong>Сотрудники</strong><button class="btn btn-ghost" onclick="openUserForm()">Добавить</button></div>
        <div class="table" style="margin-top:10px">
          ${(state.admin.users || []).map(u => `
            <div class="table-row" style="grid-template-columns:1fr auto auto">
              <div>${escapeHtml(u.login)}<div class="small">${escapeHtml(u.role)} · ${u.is_active ? 'active' : 'off'}</div></div>
              <button class="btn btn-ghost" onclick='editUserById(${u.id})'>Изм.</button>
              <button class="btn btn-red" onclick="deleteUser(${u.id})">Удал.</button>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <strong>Блокировки страниц ценников</strong>
        <div class="table" style="margin-top:10px">
          ${(state.admin.locks || []).map(l => `
            <div class="table-row">
              <div>${escapeHtml(l.category_name)} · стр. ${l.page_number}</div>
              <div class="small">${escapeHtml(l.locked_by_login || '')}</div>
              <div class="small">${escapeHtml(l.locked_at || '')}</div>
            </div>
          `).join('') || '<div class="small">Нет активных блокировок</div>'}
        </div>
      </div>

      <div class="card">
        <div class="row" style="justify-content:space-between"><strong>Push</strong><button class="btn btn-ghost" onclick="openPushForm()">Отправить</button></div>
        <div class="small" style="margin-top:8px">Подготовлено под отправку всем или одному сотруднику.</div>
      </div>

      <div class="card">
        <strong>Рейтинг сотрудников за месяц</strong>
        <div class="table" style="margin-top:10px">
          ${(state.admin.leaderboard || []).map(r => `
            <div class="table-row">
              <div>${escapeHtml(r.login)}</div>
              <div>${r.actions}</div>
              <div><strong>${r.score}</strong></div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <strong>Проблемные товары</strong>
        <div class="table" style="margin-top:10px">
          ${(state.admin.problems || []).map(p => `
            <div class="table-row" style="grid-template-columns:1fr auto auto">
              <div>${escapeHtml(p.name)}<div class="small">${escapeHtml(p.category_name)} · ${escapeHtml(p.vendor_code || '')}</div></div>
              <div class="small">Косяков</div>
              <div><strong>${p.problem_marks}</strong></div>
            </div>
          `).join('') || '<div class="small">Нет проблемных товаров</div>'}
        </div>
      </div>
    </div>
  `;
  return layout('Админка', body, `<button class="btn btn-ghost" onclick="go('home')">Назад</button>`);
}

function render() {
  if (!state.me) return renderLogin();
  switch (state.current) {
    case 'carry-categories': app.innerHTML = carryCategoriesView(); break;
    case 'carry-category': app.innerHTML = carryCategoryView(); break;
    case 'order-assembly': app.innerHTML = orderAssemblyView(); break;
    case 'price-pages': app.innerHTML = pricePagesView(); break;
    case 'price-page': app.innerHTML = pricePageView(); break;
    case 'product-check': app.innerHTML = productCheckView(); break;
    case 'calendar': app.innerHTML = calendarView(); break;
    case 'admin': app.innerHTML = adminView(); break;
    default: app.innerHTML = homeView();
  }
}

async function bootstrap() {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('/sw.js'); } catch (e) { console.warn(e); }
  }
  try {
    const me = await api('/api/auth/me');
    state.me = me.user;
    const cats = await api('/api/catalog/categories');
    state.categories = cats.categories;
    render();
  } catch {
    render();
  }
}

async function submitLogin(event) {
  event.preventDefault();
  const fd = new FormData(event.target);
  try {
    const data = await api('/api/auth/login', { method:'POST', body: JSON.stringify(Object.fromEntries(fd)) });
    state.me = data.user;
    const cats = await api('/api/catalog/categories');
    state.categories = cats.categories;
    state.current = 'home';
    render();
  } catch (e) {
    renderLogin(e.message);
  }
}

async function logout() {
  await api('/api/auth/logout', { method:'POST' });
  state.me = null;
  state.current = 'home';
  render();
}

function go(view) {
  state.current = view;
  render();
}

async function loadCarryCategories() {
  const data = await api('/api/carry/categories');
  state.carryCategories = data.categories;
  state.current = 'carry-categories';
  render();
}

async function loadCarryCategory(categoryId) {
  state.carryCategoryId = categoryId;
  const data = await api(`/api/carry/category/${categoryId}`);
  state.carryItems = data.items;
  state.current = 'carry-category';
  render();
}

async function carryIncrement(itemId) {
  await api(`/api/carry/item/${itemId}/increment`, { method:'POST' });
  await loadCarryCategory(state.carryCategoryId);
}

async function carryDecrement(itemId) {
  await api(`/api/carry/item/${itemId}/decrement`, { method:'POST' });
  await loadCarryCategory(state.carryCategoryId);
}

async function confirmCarryCategory(categoryId) {
  await api(`/api/carry/category/${categoryId}/confirm`, { method:'POST' });
  await loadCarryCategories();
}

async function loadOrderAssembly() {
  const data = await api('/api/carry/order');
  state.orderPrint = data.print;
  state.current = 'order-assembly';
  render();
}

async function completeOrder() {
  await api('/api/carry/order/complete', { method:'POST' });
  alert('Заявка собрана полностью');
}

async function loadPricePages() {
  const data = await api('/api/price-check/pages');
  state.priceGroups = data.groups;
  state.current = 'price-pages';
  render();
}

async function openPricePage(categoryId, pageNumber) {
  try {
    const data = await api('/api/price-check/page/open', { method:'POST', body: JSON.stringify({ categoryId, pageNumber }) });
    state.pricePage = { categoryId, pageNumber };
    state.priceItems = data.items;
    state.current = 'price-page';
    render();
  } catch (e) {
    alert(e.message);
  }
}

async function closePricePage(completed) {
  await api('/api/price-check/page/close', { method:'POST', body: JSON.stringify({ ...state.pricePage, completed }) });
  await loadPricePages();
}

async function togglePriceField(itemId, field) {
  await api(`/api/price-check/item/${itemId}/toggle`, { method:'POST', body: JSON.stringify({ field }) });
  await openPricePage(state.pricePage.categoryId, state.pricePage.pageNumber);
}

async function printPriceCheck() {
  const data = await api('/api/price-check/print');
  const html = `
    <h3>Проверка ценников</h3>
    ${data.rows.map(x => `<div style="padding:6px 0;border-bottom:1px solid #ddd">${escapeHtml(x.name)} · ${escapeHtml(x.vendor_code || '')} · <strong>${escapeHtml(x.status)}</strong></div>`).join('')}
  `;
  openModal(html);
}

async function loadProductCheck() {
  const data = await api('/api/product-check');
  state.productCheckItems = data.items;
  state.current = 'product-check';
  render();
}

async function hideProductCheck(itemId) {
  await api(`/api/product-check/${itemId}/hide`, { method:'POST' });
  await loadProductCheck();
}

async function loadCalendar() {
  const data = await api('/api/calendar');
  state.calendar = data;
  state.current = 'calendar';
  render();
}

function openCalendarForm(date, item) {
  const isEdit = !!item?.id;
  openModal(`
    <h3>${isEdit ? 'Изменить' : 'Добавить'} запись</h3>
    <input class="input" id="cal-date" value="${escapeHtml(item?.date || date || '')}" />
    <input class="input" id="cal-title" placeholder="Заголовок" value="${escapeHtml(item?.title || '')}" />
    <textarea class="input" id="cal-text" placeholder="Текст">${escapeHtml(item?.text || '')}</textarea>
    <div class="row">
      <button class="btn" onclick="${isEdit ? `saveCalendar(${item.id})` : `saveCalendar()`}">${isEdit ? 'Сохранить' : 'Добавить'}</button>
      <button class="btn btn-ghost" onclick="closeModal()">Закрыть</button>
    </div>
  `);
}

async function saveCalendar(id) {
  const payload = {
    date: document.getElementById('cal-date').value,
    title: document.getElementById('cal-title').value,
    text: document.getElementById('cal-text').value
  };
  await api(id ? `/api/calendar/${id}` : '/api/calendar', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
  closeModal();
  await loadCalendar();
}

async function deleteCalendarItem(id) {
  await api(`/api/calendar/${id}`, { method:'DELETE' });
  await loadCalendar();
}

async function loadAdmin() {
  const [overview, users, locks, leaderboard, problems] = await Promise.all([
    api('/api/admin/overview'),
    api('/api/admin/users'),
    api('/api/admin/locks'),
    api('/api/admin/stats/leaderboard'),
    api('/api/admin/problem-products')
  ]);
  state.admin = {
    overview: overview.overview,
    users: users.users,
    locks: locks.locks,
    leaderboard: leaderboard.leaderboard,
    problems: problems.rows
  };
  state.current = 'admin';
  render();
}

async function runSync() {
  await api('/api/admin/catalog/sync', { method:'POST' });
  await loadAdmin();
}

async function resetSync() {
  await api('/api/admin/catalog/reset-sync', { method:'POST' });
  await loadAdmin();
}

async function clearImageCache() {
  await api('/api/admin/catalog/clear-image-cache', { method:'POST' });
  alert('Кэш очищен');
}

function openUserForm(user) {
  const isEdit = !!user?.id;
  openModal(`
    <h3>${isEdit ? 'Изменить сотрудника' : 'Добавить сотрудника'}</h3>
    <input class="input" id="u-login" placeholder="Логин" value="${escapeHtml(user?.login || '')}" />
    <input class="input" id="u-password" placeholder="Пароль${isEdit ? ' (можно пусто)' : ''}" value="" />
    <select class="input" id="u-role">
      <option value="staff" ${user?.role === 'staff' ? 'selected' : ''}>staff</option>
      <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>admin</option>
    </select>
    <select class="input" id="u-active">
      <option value="1" ${user?.is_active ? 'selected' : ''}>active</option>
      <option value="0" ${!user?.is_active ? 'selected' : ''}>off</option>
    </select>
    <div class="row">
      <button class="btn" onclick="${isEdit ? `saveUser(${user.id})` : `saveUser()`}">${isEdit ? 'Сохранить' : 'Создать'}</button>
      <button class="btn btn-ghost" onclick="closeModal()">Закрыть</button>
    </div>
  `);
}

async function saveUser(id) {
  const payload = {
    login: document.getElementById('u-login').value,
    password: document.getElementById('u-password').value,
    role: document.getElementById('u-role').value,
    is_active: document.getElementById('u-active').value === '1'
  };
  await api(id ? `/api/admin/users/${id}` : '/api/admin/users', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
  closeModal();
  await loadAdmin();
}

async function deleteUser(id) {
  await api(`/api/admin/users/${id}`, { method:'DELETE' });
  await loadAdmin();
}

function openPushForm() {
  openModal(`
    <h3>Push</h3>
    <input class="input" id="push-userId" placeholder="ID пользователя или пусто для всех" />
    <input class="input" id="push-title" placeholder="Заголовок" />
    <textarea class="input" id="push-text" placeholder="Текст"></textarea>
    <div class="row">
      <button class="btn" onclick="sendPush()">Отправить</button>
      <button class="btn btn-ghost" onclick="closeModal()">Закрыть</button>
    </div>
  `);
}

async function sendPush() {
  await api('/api/admin/push/send', {
    method:'POST',
    body: JSON.stringify({
      userId: document.getElementById('push-userId').value || null,
      title: document.getElementById('push-title').value,
      text: document.getElementById('push-text').value
    })
  });
  closeModal();
  alert('Push отправлен');
}

async function installApp() {
  if (state.installPrompt) {
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    render();
  } else {
    alert('Установка доступна через меню браузера или уже выполнена.');
  }
}


function editCalendarItem(id) {
  const item = (state.calendar.items || []).find(x => x.id === id);
  if (item) openCalendarForm(item.date, item);
}

function editUserById(id) {
  const user = (state.admin.users || []).find(x => x.id === id);
  if (user) openUserForm(user);
}

function openModal(html) {
  closeModal();
  const div = document.createElement('div');
  div.className = 'modal';
  div.id = 'global-modal';
  div.innerHTML = `<div class="modal-card">${html}</div>`;
  div.addEventListener('click', (e) => { if (e.target === div) closeModal(); });
  document.body.appendChild(div);
}

function closeModal() {
  document.getElementById('global-modal')?.remove();
}

Object.assign(window, {
  submitLogin, logout, go, loadCarryCategories, loadCarryCategory,
  carryIncrement, carryDecrement, confirmCarryCategory, loadOrderAssembly,
  completeOrder, loadPricePages, openPricePage, closePricePage, togglePriceField,
  printPriceCheck, loadProductCheck, hideProductCheck, loadCalendar,
  openCalendarForm, saveCalendar, deleteCalendarItem, loadAdmin,
  runSync, resetSync, clearImageCache, openUserForm, saveUser, deleteUser,
  openPushForm, sendPush, installApp, closeModal, editCalendarItem, editUserById
});

bootstrap();
