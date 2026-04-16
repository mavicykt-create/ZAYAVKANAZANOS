import { api } from './api.js';
import { initPwa, promptInstall } from './pwa.js';

const app = document.getElementById('app');
const state = {
  user: null,
  installReady: false,
  route: 'home',
  currentCategory: null,
  pricePage: null,
  carryItems: [],
  carryAssembly: []
};

initPwa((ready) => { state.installReady = ready; render(); });
bootstrap();

async function bootstrap() {
  try {
    const { user } = await api('/auth/me');
    state.user = user;
    await loadHome();
  } catch {
    render();
  }
}

function setTop(message) {
  state.flash = message;
  render();
  if (message) setTimeout(() => { state.flash = ''; render(); }, 1800);
}

async function loadHome() {
  state.route = 'home';
  const [catalog, sync, overview] = await Promise.all([
    api('/catalog/categories'),
    api('/catalog/sync-state'),
    state.user?.role === 'admin' ? api('/admin/overview') : Promise.resolve(null)
  ]);
  state.categories = catalog.items;
  state.syncState = sync.item;
  state.overview = overview;
  render();
}

function authView() {
  app.innerHTML = `
    <div class="auth-wrap">
      <form class="auth-card" id="login-form">
        <h1 class="auth-title">ZAN 1.1</h1>
        <p class="auth-subtitle">Вход</p>
        <label class="field"><span class="label">Логин</span><input class="input" name="login" autocomplete="username" required /></label>
        <label class="field"><span class="label">Пароль</span><input class="input" name="password" type="password" autocomplete="current-password" required /></label>
        <button class="btn btn-primary" type="submit">Войти</button>
        <p class="notice">По умолчанию: admin / 7895123 и user / 7895123</p>
      </form>
    </div>`;

  document.getElementById('login-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const { user } = await api('/auth/login', { method: 'POST', body: { login: form.get('login'), password: form.get('password') } });
      state.user = user;
      await loadHome();
    } catch (error) { alert(error.message); }
  };
}

function header(title, back = false) {
  return `
    <div class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <h1>${title}</h1>
          <div class="badge">${state.user.login} · ${state.user.role}</div>
        </div>
        ${state.flash ? `<div class="badge">${state.flash}</div>` : ''}
        <div class="install-row">
          ${back ? '<button class="btn btn-soft" id="back-btn">Назад</button>' : '<button class="btn btn-soft" id="home-btn">Главная</button>'}
          <button class="btn btn-secondary" id="logout-btn">Выйти</button>
        </div>
      </div>
    </div>`;
}

function homeView() {
  app.innerHTML = `
    <div class="screen">
      ${header('ZAN 1.1')}
      <div class="panel">
        <div class="kv">
          <div>Синхронизация: <b>${state.syncState?.status || 'idle'}</b></div>
          <div>${state.syncState?.stage || ''} · ${state.syncState?.progress_percent || 0}%</div>
          <div>${state.syncState?.message || ''}</div>
        </div>
      </div>
      <div class="menu-grid" style="margin-top:12px;">
        ${menuCard('carry', 'Заявка на занос', 'Сборка доступна всегда')}
        ${menuCard('price-check', 'Проверка ценников', 'Страницы по 50 товаров')}
        ${menuCard('product-check', 'Проверка товара', 'Только без штрих-кода')}
        ${menuCard('calendar', 'Календарь недели', 'Новости, задачи, дела')}
        ${state.user?.role === 'admin' ? menuCard('admin', 'Админка', 'Управление системой') : ''}
        ${state.installReady ? menuCard('install', 'Установить на мобильный', 'Добавить на экран') : ''}
      </div>
    </div>`;

  bindHeader();
  document.querySelectorAll('[data-menu]').forEach((btn) => btn.onclick = onMenuClick);
}

function menuCard(id, title, text) {
  return `<button class="menu-card" data-menu="${id}"><h3>${title}</h3><p>${text}</p></button>`;
}

function bindHeader() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => null);
    state.user = null;
    render();
  });
  document.getElementById('home-btn')?.addEventListener('click', () => loadHome());
  document.getElementById('back-btn')?.addEventListener('click', () => loadHome());
}

async function onMenuClick(event) {
  const id = event.currentTarget.dataset.menu;
  if (id === 'carry') return openCarryCategories();
  if (id === 'price-check') return openPricePages();
  if (id === 'product-check') return openProductCheck();
  if (id === 'calendar') return openCalendar();
  if (id === 'admin') return openAdmin();
  if (id === 'install') {
    const ok = await promptInstall();
    if (!ok) alert('Установка доступна через меню браузера, если кнопка системы еще не появилась.');
  }
}

async function openCarryCategories() {
  const { items } = await api('/catalog/categories');
  app.innerHTML = `<div class="screen">${header('Заявка на занос', true)}<div class="panel"><button class="btn btn-primary" id="assembly-btn">Сборка заявки</button></div><div class="list" id="carry-list"></div></div>`;
  bindHeader();
  document.getElementById('assembly-btn').onclick = openAssembly;
  const list = document.getElementById('carry-list');
  list.innerHTML = items.map((item) => `<button class="row-card" data-category="${item.id}"><div><h4>${item.name}</h4><p>Товаров: ${item.product_count}</p></div><span class="status-yellow">Открыть</span></button>`).join('');
  list.querySelectorAll('[data-category]').forEach((el) => el.onclick = () => openCarryCategory(Number(el.dataset.category)));
}

async function openCarryCategory(categoryId) {
  state.currentCategory = categoryId;
  const [{ items }, { items: categories }] = await Promise.all([api(`/carry/category/${categoryId}`), api('/catalog/categories')]);
  const category = categories.find((c) => c.id === categoryId);
  state.carryItems = items;
  app.innerHTML = `
    <div class="screen scroll-region">
      ${header(category?.name || 'Категория', true)}
      <div class="grid-products" id="carry-grid"></div>
      <div class="bottom-bar"><button class="btn btn-primary" style="width:100%;" id="complete-category">Подтвердить заявку категории</button></div>
    </div>`;
  bindHeader();
  renderCarryGrid();
  document.getElementById('complete-category').onclick = async () => {
    await api('/carry/complete-category', { method: 'POST', body: { categoryId } });
    setTop('Категория подтверждена');
    openCarryCategories();
  };
}

function renderCarryGrid() {
  const grid = document.getElementById('carry-grid');
  grid.innerHTML = state.carryItems.map((item) => `
    <div class="tile">
      <button class="qty-circle big" data-dec="${item.id}">−</button>
      <img src="${item.picture_cached || item.picture || '/images/placeholder.svg'}" alt="" loading="lazy" />
      <div class="tile-title">${item.name}</div>
      <div class="tile-footer">
        <div class="tile-code">${item.vendor_code}</div>
        <div class="badge">${item.qty}</div>
      </div>
      <button style="position:absolute;inset:0;background:transparent;" data-inc="${item.id}" aria-label="Добавить"></button>
    </div>`).join('');

  grid.querySelectorAll('[data-inc]').forEach((el) => el.onclick = (e) => changeCarry(Number(e.currentTarget.dataset.inc), 'inc'));
  grid.querySelectorAll('[data-dec]').forEach((el) => el.onclick = (e) => { e.stopPropagation(); changeCarry(Number(e.currentTarget.dataset.dec), 'dec'); });
}

async function changeCarry(productId, direction) {
  const { item } = await api('/carry/change', { method: 'POST', body: { categoryId: state.currentCategory, productId, direction } });
  state.carryItems = state.carryItems.map((row) => row.id === productId ? { ...row, qty: item.qty } : row);
  renderCarryGrid();
}

async function openAssembly() {
  const { items } = await api('/carry/assembly');
  state.carryAssembly = items;
  app.innerHTML = `
    <div class="screen">
      ${header('Сборка заявки', true)}
      <div class="panel btn-row">
        <button class="btn btn-soft" id="print-carry">Печать</button>
        <button class="btn btn-primary" id="complete-order">Заявка собрана полностью</button>
      </div>
      <div class="list assembly-list" id="assembly-list"></div>
    </div>`;
  bindHeader();
  document.getElementById('complete-order').onclick = async () => {
    await api('/carry/complete-order', { method: 'POST' });
    setTop('Заявка собрана');
    openCarryCategories();
  };
  document.getElementById('print-carry').onclick = printCarry;
  renderAssembly();
}

function renderAssembly() {
  const wrap = document.getElementById('assembly-list');
  if (!state.carryAssembly.length) {
    wrap.innerHTML = '<div class="panel center muted">Нет товаров qty &gt; 0</div>';
    return;
  }
  let prevCategory = null;
  wrap.innerHTML = state.carryAssembly.map((item) => {
    const headerBlock = prevCategory !== item.category_id ? `<div class="panel-title" style="margin-bottom:8px;">${item.category_name}</div>` : '';
    prevCategory = item.category_id;
    return `<div>${headerBlock}<label class="row-card"><input type="checkbox" checked style="margin-top:4px;" /> <div><h4>${item.name}</h4><p>${item.vendor_code} · ${item.qty} шт.</p></div></label></div>`;
  }).join('');
}

async function printCarry() {
  await api('/carry/print-log', { method: 'POST', body: { count: state.carryAssembly.length } });
  const now = new Date();
  let currentCategory = null;
  const rows = state.carryAssembly.map((item) => {
    const cat = currentCategory !== item.category_name ? `<tr><td colspan="3"><b>${item.category_name}</b></td></tr>` : '';
    currentCategory = item.category_name;
    return `${cat}<tr><td>${item.name}</td><td>${item.vendor_code}</td><td>${item.qty}</td></tr>`;
  }).join('');
  printHtml(`
    <h2>Заявка на занос</h2>
    <p>${now.toLocaleDateString('ru-RU')} ${now.toLocaleTimeString('ru-RU')}</p>
    <table border="1" cellspacing="0" cellpadding="6" width="100%"><tr><th>Товар</th><th>Артикул</th><th>Количество</th></tr>${rows}</table>
  `);
}

async function openPricePages() {
  const { items } = await api('/price-check/pages');
  app.innerHTML = `<div class="screen">${header('Проверка ценников', true)}<div class="list" id="price-pages"></div></div>`;
  bindHeader();
  const wrap = document.getElementById('price-pages');
  wrap.innerHTML = items.map((block) => `
    <div class="panel">
      <div class="panel-title" style="margin-bottom:8px;">${block.category.name}</div>
      <div class="list">${block.pages.map((page) => `<button class="row-card" data-open-page="${block.category.id}:${page.page_number}"><div><h4>Страница ${page.page_number}</h4><p>${page.locked_by ? `Занято: ${page.locked_by_login}` : 'Свободно'}</p></div><span class="${page.locked_by ? 'status-red' : 'status-green'}">${page.locked_by ? 'Занято' : 'Открыть'}</span></button>`).join('')}</div>
    </div>`).join('');
  wrap.querySelectorAll('[data-open-page]').forEach((el) => el.onclick = async () => {
    const [categoryId, pageNumber] = el.dataset.openPage.split(':').map(Number);
    try {
      await openPricePage(categoryId, pageNumber);
    } catch (error) {
      alert(error.message);
    }
  });
}

async function openPricePage(categoryId, pageNumber) {
  const { items } = await api('/price-check/pages/open', { method: 'POST', body: { categoryId, pageNumber } });
  state.pricePage = { categoryId, pageNumber, items };
  app.innerHTML = `
    <div class="screen">
      ${header(`Страница ${pageNumber}`, true)}
      <div class="panel btn-row">
        <button class="btn btn-soft" id="print-price-page">Печать</button>
        <button class="btn btn-primary" id="release-price-page">Готово</button>
      </div>
      <div class="list" id="price-page-list"></div>
    </div>`;
  bindHeader();
  document.getElementById('release-price-page').onclick = async () => {
    await api('/price-check/pages/release', { method: 'POST', body: { categoryId, pageNumber } });
    setTop('Страница завершена');
    openPricePages();
  };
  document.getElementById('print-price-page').onclick = printPricePage;
  renderPricePage();
}

function renderPricePage() {
  const wrap = document.getElementById('price-page-list');
  wrap.innerHTML = state.pricePage.items.map((item) => `
    <div class="row-card">
      <img src="${item.picture_cached || '/images/placeholder.svg'}" alt="" width="56" height="56" style="border-radius:12px;background:#f7f8fa;object-fit:contain;" />
      <div style="flex:1; min-width:0;">
        <h4>${item.name}</h4>
        <p>${item.vendor_code}</p>
      </div>
      <div style="display:grid;gap:8px;">
        <button class="btn ${item.is_problem ? 'btn-danger' : 'btn-soft'}" data-problem="${item.id}">Проблема</button>
        <button class="btn ${item.is_price_tag ? 'btn-primary' : 'btn-soft'}" data-price="${item.id}">Ценник</button>
      </div>
    </div>`).join('');
  wrap.querySelectorAll('[data-problem]').forEach((el) => el.onclick = () => togglePriceMark(Number(el.dataset.problem), 'problem'));
  wrap.querySelectorAll('[data-price]').forEach((el) => el.onclick = () => togglePriceMark(Number(el.dataset.price), 'price'));
}

async function togglePriceMark(productId, markType) {
  const { item } = await api('/price-check/toggle', { method: 'POST', body: { productId, markType } });
  state.pricePage.items = state.pricePage.items.map((row) => row.id === productId ? { ...row, is_problem: item.isProblem, is_price_tag: item.isPriceTag } : row);
  renderPricePage();
}

async function printPricePage() {
  await api('/price-check/print-log', { method: 'POST', body: { pageNumber: state.pricePage.pageNumber } });
  const rows = state.pricePage.items.map((item) => `<tr><td>${item.name}</td><td>${item.vendor_code}</td><td>${item.is_problem ? 'Проблема' : item.is_price_tag ? 'Ценник' : ''}</td></tr>`).join('');
  printHtml(`<h2>Проверка ценников</h2><table border="1" cellspacing="0" cellpadding="6" width="100%"><tr><th>Название</th><th>Артикул</th><th>Статус</th></tr>${rows}</table>`);
}

async function openProductCheck() {
  const { items } = await api('/product-check');
  app.innerHTML = `<div class="screen">${header('Проверка товара', true)}<div class="list" id="product-check-list"></div></div>`;
  bindHeader();
  const wrap = document.getElementById('product-check-list');
  wrap.innerHTML = items.map((item) => `<div class="row-card"><div><h4>${item.name}</h4><p>${item.category_name} · ${item.vendor_code}</p></div><button class="btn btn-danger" data-hide-product="${item.id}">−</button></div>`).join('');
  wrap.querySelectorAll('[data-hide-product]').forEach((el) => el.onclick = async () => {
    await api('/product-check/hide', { method: 'POST', body: { productId: Number(el.dataset.hideProduct) } });
    openProductCheck();
  });
}

async function openCalendar() {
  const { items } = await api('/calendar');
  app.innerHTML = `<div class="screen">${header('Календарь недели', true)}<div class="day-grid" id="week-grid"></div>${state.user.role === 'admin' ? '<div class="panel" style="margin-top:12px;"><button class="btn btn-primary" id="new-cal-item">Добавить запись</button></div>' : ''}</div>`;
  bindHeader();
  const days = ['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'];
  const wrap = document.getElementById('week-grid');
  wrap.innerHTML = items.map((day, index) => `<div class="day-card"><h4>${days[index]} · ${day.date}</h4>${day.items.length ? day.items.map((item) => `<div class="panel" style="margin-top:8px;"><b>${item.title}</b><div class="notice">${item.text || ''}</div>${state.user.role === 'admin' ? `<div style="margin-top:8px;"><button class="btn btn-soft" data-edit-cal='${JSON.stringify(item)}'>Редактировать</button> <button class="btn btn-danger" data-del-cal='${item.id}'>Удалить</button></div>` : ''}</div>`).join('') : '<div class="muted">Пусто</div>'}</div>`).join('');
  document.getElementById('new-cal-item')?.addEventListener('click', () => calendarModal());
  wrap.querySelectorAll('[data-edit-cal]').forEach((el) => el.onclick = () => calendarModal(JSON.parse(el.dataset.editCal)));
  wrap.querySelectorAll('[data-del-cal]').forEach((el) => el.onclick = async () => { await api(`/calendar/${el.dataset.delCal}`, { method: 'DELETE' }); openCalendar(); });
}

function calendarModal(item = {}) {
  const date = prompt('Дата YYYY-MM-DD', item.date || new Date().toISOString().slice(0, 10));
  if (!date) return;
  const title = prompt('Заголовок', item.title || '');
  if (!title) return;
  const text = prompt('Текст', item.text || '') || '';
  api('/calendar', { method: 'POST', body: { id: item.id, date, title, text } }).then(openCalendar).catch((error) => alert(error.message));
}

async function openAdmin() {
  const [overview, users, rating, locks, problems] = await Promise.all([
    api('/admin/overview'), api('/admin/users'), api('/admin/stats/rating'), api('/admin/locks'), api('/admin/problem-items')
  ]);
  app.innerHTML = `
    <div class="screen">
      ${header('Админка', true)}
      <div class="admin-grid">
        <div class="panel"><h3 class="section-title">Обзор</h3><div class="kv"><div>Онлайн: <b>${overview.online}</b></div><div>Товаров: <b>${overview.products}</b></div><div>Без штрих-кода: <b>${overview.noBarcode}</b></div><div>Sync: <b>${overview.syncState?.status}</b> · ${overview.syncState?.progress_percent}%</div></div></div>
        <div class="panel"><h3 class="section-title">Каталог</h3><div class="btn-row" style="margin-top:10px;"><button class="btn btn-primary" id="sync-now">Обновить каталог</button><button class="btn btn-danger" id="sync-reset">Сбросить обновление</button></div><div style="margin-top:10px;"><button class="btn btn-soft" id="clear-cache" style="width:100%;">Очистка кэша</button></div></div>
        <div class="panel"><h3 class="section-title">Сотрудники</h3><div class="table-card" style="margin-top:10px;"><table class="simple-table"><tr><th>Логин</th><th>Роль</th><th>Активен</th></tr>${users.items.map((u) => `<tr><td>${u.login}</td><td>${u.role}</td><td>${u.is_active ? 'Да' : 'Нет'}</td></tr>`).join('')}</table></div><button class="btn btn-soft" id="add-user" style="margin-top:10px;width:100%;">Добавить сотрудника</button></div>
        <div class="panel"><h3 class="section-title">Блокировки страниц</h3><div class="notice">${locks.items.length ? locks.items.map((l) => `${l.category_name} / стр. ${l.page_number} / ${l.locked_by}`).join('<br>') : 'Нет блокировок'}</div></div>
        <div class="panel"><h3 class="section-title">Push</h3><div class="btn-row" style="margin-top:10px;"><button class="btn btn-soft" id="push-all">Отправка всем</button><button class="btn btn-soft" id="push-one">Отправка одному</button></div></div>
        <div class="panel"><h3 class="section-title">Статистика</h3><div class="table-card" style="margin-top:10px;"><table class="simple-table"><tr><th>Сотрудник</th><th>Баллы</th><th>Действия</th></tr>${rating.items.map((r) => `<tr><td>${r.login}</td><td>${r.work_score || 0}</td><td>${r.actions_count || 0}</td></tr>`).join('')}</table></div></div>
        <div class="panel"><h3 class="section-title">Проблемные товары</h3><div class="notice">${problems.items.length ? problems.items.map((p) => `${p.name} (${p.vendor_code})`).join('<br>') : 'Нет проблемных товаров'}</div></div>
      </div>
    </div>`;
  bindHeader();
  document.getElementById('sync-now').onclick = async () => { const r = await api('/admin/catalog/sync', { method: 'POST' }); alert(r.message); openAdmin(); };
  document.getElementById('sync-reset').onclick = async () => { await api('/admin/catalog/reset', { method: 'POST' }); openAdmin(); };
  document.getElementById('clear-cache').onclick = async () => { await api('/admin/catalog/clear-cache', { method: 'POST' }); alert('Кэш очищен'); };
  document.getElementById('add-user').onclick = addUserFlow;
  document.getElementById('push-all').onclick = () => pushFlow();
  document.getElementById('push-one').onclick = () => pushFlow(true);
}

async function addUserFlow() {
  const login = prompt('Логин');
  if (!login) return;
  const password = prompt('Пароль', '7895123') || '7895123';
  const role = prompt('Роль: admin или staff', 'staff') || 'staff';
  await api('/admin/users', { method: 'POST', body: { login, password, role, isActive: true } });
  openAdmin();
}

async function pushFlow(single = false) {
  const title = prompt('Заголовок push', 'ZAN 1.1');
  if (!title) return;
  const text = prompt('Текст push', 'Новая задача');
  if (!text) return;
  const body = { title, text };
  if (single) {
    const id = prompt('ID сотрудника');
    if (!id) return;
    body.userId = Number(id);
  }
  const { result } = await api('/admin/push/send', { method: 'POST', body });
  alert(result.configured ? `Доставлено: ${result.delivered}` : 'VAPID ключи не заданы, push пока в режиме подготовки');
}

function printHtml(html) {
  const win = window.open('', '_blank');
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Печать</title></head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function render() {
  if (!state.user) return authView();
  return homeView();
}
