const state = {
  token: localStorage.getItem('zanToken') || '',
  me: null,
  timers: [],
  loginDraft: 'admin',
  passwordDraft: '123456',
};

const app = document.getElementById('app');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function stopTimers() {
  for (const timer of state.timers) clearInterval(timer);
  state.timers = [];
}

function addTimer(timerId) {
  state.timers.push(timerId);
}

function navigate(path, replace = false) {
  if (window.location.pathname === path) return;
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  renderRoute().catch((error) => renderFatal(error));
}

function authHeaders(extra = {}) {
  const headers = { ...extra };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  return headers;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: authHeaders({
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    }),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || 'Ошибка запроса');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadMe() {
  const data = await api('/api/me');
  state.me = data.user;
  return state.me;
}

function statusText(status) {
  if (status === 'locked') return 'Занята';
  if (status === 'completed') return 'Завершена';
  return 'Свободна';
}

function statusClass(status) {
  if (status === 'locked') return 'status status-lock';
  if (status === 'completed') return 'status status-ok';
  return 'status status-free';
}

function imageProxy(url) {
  if (!url) return '';
  return `/api/image?token=${encodeURIComponent(state.token)}&url=${encodeURIComponent(url)}`;
}

function renderFatal(error) {
  app.innerHTML = `
    <div class="page page-center">
      <div class="card">
        <h1>Ошибка</h1>
        <p>${escapeHtml(error?.message || 'Неизвестная ошибка')}</p>
        <button id="retryBtn" class="btn">Повторить</button>
      </div>
    </div>
  `;
  const retry = document.getElementById('retryBtn');
  if (retry) {
    retry.onclick = () => renderRoute().catch((err) => renderFatal(err));
  }
}

function renderTop(title, subtitle = '') {
  return `
    <div class="top card">
      <div>
        <div class="brand">ZAN 1.1</div>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
      </div>
      <div class="top-actions">
        ${state.me ? `<span class="pill">${escapeHtml(state.me.login)} · ${escapeHtml(state.me.role)}</span>` : ''}
        ${state.me ? '<button id="logoutBtn" class="btn btn-light">Выйти</button>' : ''}
      </div>
    </div>
  `;
}

function bindLogoutButton() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (!logoutBtn) return;
  logoutBtn.onclick = async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch {}
    state.token = '';
    state.me = null;
    localStorage.removeItem('zanToken');
    navigate('/login', true);
  };
}

function attachNavHandlers() {
  document.querySelectorAll('[data-nav]').forEach((element) => {
    element.onclick = () => {
      navigate(element.dataset.nav);
    };
  });
}

function openPrintWindow(html) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

function carryPrintHtml(data) {
  const createdAt = new Date(data.generatedAt || Date.now()).toLocaleString('ru-RU');
  return `<!doctype html>
  <html lang="ru">
    <head>
      <meta charset="UTF-8" />
      <title>Заявка на занос</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
        h1 { margin: 0 0 6px; }
        .meta { margin-bottom: 18px; color: #444; }
        .cat { margin: 14px 0 8px; font-size: 18px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th:last-child, td:last-child { width: 120px; text-align: center; }
      </style>
    </head>
    <body>
      <h1>Заявка на занос</h1>
      <div class="meta">Дата и время: ${escapeHtml(createdAt)}</div>
      ${data.categories.map((category) => `
        <div class="cat">${escapeHtml(category.categoryName)}</div>
        <table>
          <thead><tr><th>Товар</th><th>Количество</th></tr></thead>
          <tbody>
            ${category.items.map((item) => `
              <tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.qty)}</td></tr>
            `).join('')}
          </tbody>
        </table>
      `).join('')}
    </body>
  </html>`;
}

function priceCheckPrintHtml(data) {
  const createdAt = new Date(data.generatedAt || Date.now()).toLocaleString('ru-RU');
  return `<!doctype html>
  <html lang="ru">
    <head>
      <meta charset="UTF-8" />
      <title>Отчёт проверки ценников</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
        h1 { margin: 0 0 6px; }
        .meta { margin-bottom: 18px; color: #444; }
        .cat { margin: 14px 0 8px; font-size: 18px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      </style>
    </head>
    <body>
      <h1>Проверка ценников</h1>
      <div class="meta">Дата и время: ${escapeHtml(createdAt)}</div>
      ${data.categories.map((category) => `
        <div class="cat">${escapeHtml(category.categoryName)}</div>
        <table>
          <thead><tr><th>Товар</th><th>Статус</th></tr></thead>
          <tbody>
            ${category.items.map((item) => `
              <tr>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.noStock ? 'Нет товара' : '')}${item.noStock && item.noPriceTag ? ', ' : ''}${escapeHtml(item.noPriceTag ? 'Нет ценника' : '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `).join('')}
    </body>
  </html>`;
}

function renderLogin(error = '') {
  stopTimers();
  app.innerHTML = `
    <div class="page page-center">
      <div class="card login-card">
        <div class="brand">ZAN 1.1</div>
        <h1>Вход</h1>
        <label>Логин
          <input id="loginInput" value="${escapeHtml(state.loginDraft)}" />
        </label>
        <label>Пароль
          <input id="passwordInput" type="password" value="${escapeHtml(state.passwordDraft)}" />
        </label>
        <button id="loginBtn" class="btn btn-block">Войти</button>
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
      </div>
    </div>
  `;

  const loginBtn = document.getElementById('loginBtn');
  loginBtn.onclick = async () => {
    state.loginDraft = document.getElementById('loginInput').value.trim();
    state.passwordDraft = document.getElementById('passwordInput').value.trim();
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: { login: state.loginDraft, password: state.passwordDraft },
      });
      state.token = data.token;
      localStorage.setItem('zanToken', state.token);
      await loadMe();
      navigate('/', true);
    } catch (err) {
      renderLogin(err.message);
    }
  };
}

async function renderHome(note = '') {
  const data = await api('/api/state');
  const dashboard = data.state;
  const sync = dashboard.sync || {};

  const carryDone = dashboard.carryCategories.filter((item) => item.status === 'completed').length;
  const priceDone = dashboard.priceCheckCategories.filter((item) => item.status === 'completed').length;

  app.innerHTML = `
    <div class="page">
      ${renderTop('Главная', 'Стартовая панель модулей')}
      <div class="grid cards-2">
        <button class="card btn-tile" data-nav="/carry">
          <div class="tile-title">Заявка на занос</div>
          <div class="tile-sub">${carryDone} из ${dashboard.carryCategories.length} завершено</div>
        </button>
        <button class="card btn-tile" data-nav="/price-check">
          <div class="tile-title">Проверка ценников</div>
          <div class="tile-sub">${priceDone} из ${dashboard.priceCheckCategories.length} завершено</div>
        </button>
        <button class="card btn-tile" data-nav="/product-check">
          <div class="tile-title">Проверка товара</div>
          <div class="tile-sub">Нет штрих-кода</div>
        </button>
        ${state.me?.role === 'admin' ? `
          <button class="card btn-tile" data-nav="/admin">
            <div class="tile-title">Админка</div>
            <div class="tile-sub">Сотрудники и блокировки</div>
          </button>
        ` : ''}
      </div>

      <div class="card">
        <div class="row row-between">
          <h2>Синхронизация каталога</h2>
          <span class="pill">${Number(sync.progress || 0)}%</span>
        </div>
        <div class="subtitle">${escapeHtml(sync.message || 'Ожидание')}</div>
        <div class="subtitle">
          Последнее обновление: ${sync.lastFinishedAt ? new Date(sync.lastFinishedAt).toLocaleString('ru-RU') : '—'}
        </div>
        <div class="row">
          <button id="syncBtn" class="btn" ${sync.running ? 'disabled' : ''}>Обновить каталог</button>
          ${state.me?.role === 'admin' ? '<button id="syncResetBtn" class="btn btn-light">Сброс зависшего обновления</button>' : ''}
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
    </div>
  `;

  bindLogoutButton();
  attachNavHandlers();

  const syncBtn = document.getElementById('syncBtn');
  if (syncBtn) {
    syncBtn.onclick = async () => {
      try {
        const result = await api('/api/sync-yml', { method: 'POST' });
        await renderHome(result.message || 'Синхронизация запущена');
      } catch (err) {
        await renderHome(err.message);
      }
    };
  }

  const syncResetBtn = document.getElementById('syncResetBtn');
  if (syncResetBtn) {
    syncResetBtn.onclick = async () => {
      try {
        const result = await api('/api/sync-reset', { method: 'POST' });
        await renderHome(result.message || 'Сброс выполнен');
      } catch (err) {
        await renderHome(err.message);
      }
    };
  }

  addTimer(setInterval(() => {
    if (window.location.pathname === '/') {
      renderHome().catch(() => {});
    }
  }, 7000));
}

function categoryRow(category, modulePath) {
  const action = category.status === 'completed'
    ? '<span class="status status-ok">Завершена</span>'
    : category.status === 'locked'
      ? (category.isLockedByMe
        ? `<button class="btn btn-light" data-open="${modulePath}/${category.categoryId}">Продолжить</button>`
        : `<button class="btn btn-light" data-unlock="${category.categoryId}">Разблокировать</button>`)
      : `<button class="btn" data-open="${modulePath}/${category.categoryId}">Открыть</button>`;
  return `
    <div class="list-item">
      <div>
        <div class="item-title">${escapeHtml(category.name)}</div>
        <div class="${statusClass(category.status)}">${statusText(category.status)}</div>
      </div>
      ${action}
    </div>
  `;
}

async function renderCarryCategories(note = '') {
  const [categoriesResult, stateResult] = await Promise.all([
    api('/api/carry/categories'),
    api('/api/state'),
  ]);
  const categories = categoriesResult.categories;
  const canOpenPicking = Boolean(stateResult.state.canOpenPicking);

  app.innerHTML = `
    <div class="page">
      ${renderTop('Заявка на занос', 'Категории модуля carry')}
      <div class="card">
        <div class="row row-between">
          <h2>Категории</h2>
          <button class="btn btn-light" data-nav="/">На главную</button>
        </div>
        <div class="list">${categories.map((item) => categoryRow(item, '/carry')).join('')}</div>
        <div class="row">
          <button id="openPickingBtn" class="btn ${canOpenPicking ? '' : 'btn-disabled'}" ${canOpenPicking ? '' : 'disabled'}>Сборка заявки</button>
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
    </div>
  `;

  bindLogoutButton();
  attachNavHandlers();

  document.querySelectorAll('[data-open]').forEach((element) => {
    element.onclick = async () => {
      const path = element.dataset.open;
      const categoryId = Number(path.split('/').at(-1));
      try {
        await api(`/api/carry/categories/${categoryId}/lock`, { method: 'POST' });
        navigate(path);
      } catch (err) {
        await renderCarryCategories(err.message);
      }
    };
  });

  document.querySelectorAll('[data-unlock]').forEach((element) => {
    element.onclick = async () => {
      try {
        await api(`/api/carry/categories/${element.dataset.unlock}/unlock`, { method: 'POST' });
        await renderCarryCategories('Категория разблокирована');
      } catch (err) {
        await renderCarryCategories(err.message);
      }
    };
  });

  const openPickingBtn = document.getElementById('openPickingBtn');
  if (openPickingBtn) {
    openPickingBtn.onclick = () => navigate('/carry/picking');
  }

  addTimer(setInterval(() => {
    if (window.location.pathname === '/carry') {
      renderCarryCategories().catch(() => {});
    }
  }, 6000));
}

function productCard(product, mode = 'carry') {
  const image = imageProxy(product.picture);
  if (mode === 'carry') {
    return `
      <div class="product" data-inc="${product.id}">
        <div class="image">
          ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" />` : '<div class="img-empty">Нет фото</div>'}
          <button class="qty" ${product.qty > 0 ? `data-dec="${product.id}"` : 'disabled'}>${product.qty > 0 ? product.qty : '+'}</button>
        </div>
        <div class="product-name">${escapeHtml(product.name)}</div>
      </div>
    `;
  }
  return `
    <div class="product ${product.noStock ? 'flag-stock' : ''} ${product.noPriceTag ? 'flag-tag' : ''}">
      <div class="image">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" />` : '<div class="img-empty">Нет фото</div>'}
      </div>
      <div class="product-name">${escapeHtml(product.name)}</div>
      <div class="row wrap">
        <button class="btn btn-small ${product.noStock ? 'btn-green' : 'btn-light'}" data-toggle-stock="${product.id}">Нет товара</button>
        <button class="btn btn-small ${product.noPriceTag ? 'btn-yellow' : 'btn-light'}" data-toggle-tag="${product.id}">Нет ценника</button>
      </div>
    </div>
  `;
}

async function renderCarryCategory(categoryId, options = {}) {
  const { lockOnEnter = true, note = '' } = options;
  if (lockOnEnter) {
    await api(`/api/carry/categories/${categoryId}/lock`, { method: 'POST' });
  }
  const data = await api(`/api/carry/category/${categoryId}/products`);

  app.innerHTML = `
    <div class="page">
      ${renderTop(data.category.name, 'Нажатие на карточку: +1, на круг: -1')}
      <div class="card">
        <div class="row row-between">
          <button class="btn btn-light" data-nav="/carry">Назад</button>
          <div class="row">
            <button id="unlockBtn" class="btn btn-light">Разблокировать категорию</button>
            <button id="completeBtn" class="btn btn-green">Подтвердить заявку категории</button>
          </div>
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
      <div class="grid products-grid">
        ${data.products.map((item) => productCard(item, 'carry')).join('')}
      </div>
    </div>
  `;

  bindLogoutButton();
  attachNavHandlers();

  const completeBtn = document.getElementById('completeBtn');
  completeBtn.onclick = async () => {
    try {
      await api(`/api/carry/categories/${categoryId}/complete`, { method: 'POST' });
      navigate('/carry');
    } catch (err) {
      await renderCarryCategory(categoryId, { lockOnEnter: false, note: err.message });
    }
  };

  const unlockBtn = document.getElementById('unlockBtn');
  unlockBtn.onclick = async () => {
    try {
      await api(`/api/carry/categories/${categoryId}/unlock`, { method: 'POST' });
      navigate('/carry');
    } catch (err) {
      await renderCarryCategory(categoryId, { lockOnEnter: false, note: err.message });
    }
  };

  document.querySelectorAll('[data-inc]').forEach((element) => {
    element.onclick = async () => {
      try {
        await api(`/api/carry/items/${element.dataset.inc}/increment`, { method: 'POST' });
        await renderCarryCategory(categoryId, { lockOnEnter: false });
      } catch (err) {
        await renderCarryCategory(categoryId, { lockOnEnter: false, note: err.message });
      }
    };
  });

  document.querySelectorAll('[data-dec]').forEach((element) => {
    element.onclick = async (event) => {
      event.stopPropagation();
      try {
        await api(`/api/carry/items/${element.dataset.dec}/decrement`, { method: 'POST' });
        await renderCarryCategory(categoryId, { lockOnEnter: false });
      } catch (err) {
        await renderCarryCategory(categoryId, { lockOnEnter: false, note: err.message });
      }
    };
  });

  addTimer(setInterval(() => {
    if (window.location.pathname === `/carry/${categoryId}`) {
      api(`/api/carry/categories/${categoryId}/heartbeat`, { method: 'POST' }).catch(() => {});
    }
  }, 20000));

  addTimer(setInterval(() => {
    if (window.location.pathname === `/carry/${categoryId}`) {
      renderCarryCategory(categoryId, { lockOnEnter: false }).catch(() => {});
    }
  }, 7000));
}

function pickingItemCard(item) {
  const image = imageProxy(item.picture);
  return `
    <div class="list-item">
      <div class="item-col">
        <div class="item-title">${escapeHtml(item.name)}</div>
        <div class="subtitle">Количество: ${item.qty}</div>
      </div>
      <div class="row">
        <button class="btn ${item.picked ? 'btn-green' : 'btn-light'}" data-toggle-picked="${item.productId}">
          ${item.picked ? 'Собран' : 'Отметить'}
        </button>
        ${image ? `<img class="thumb" src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" />` : ''}
      </div>
    </div>
  `;
}

async function renderCarryPicking(note = '') {
  const data = await api('/api/carry/picking');
  app.innerHTML = `
    <div class="page">
      ${renderTop('Сборка заявки', `Собрано ${data.pickedItems} из ${data.totalItems}`)}
      <div class="card">
        <div class="row row-between">
          <button class="btn btn-light" data-nav="/carry">Назад</button>
          <div class="row">
            <button id="printBtn" class="btn btn-light">Печать формы</button>
            <button id="completeAllBtn" class="btn btn-green">Заявка собрана полностью</button>
          </div>
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
      ${data.categories.length === 0 ? '<div class="card">Нет товаров с количеством > 0</div>' : ''}
      ${data.categories.map((category) => `
        <div class="card">
          <h2>${escapeHtml(category.categoryName)}</h2>
          <div class="list">${category.items.map((item) => pickingItemCard(item)).join('')}</div>
        </div>
      `).join('')}
    </div>
  `;

  bindLogoutButton();
  attachNavHandlers();

  document.querySelectorAll('[data-toggle-picked]').forEach((element) => {
    element.onclick = async () => {
      try {
        await api(`/api/carry/items/${element.dataset.togglePicked}/toggle-picked`, { method: 'POST' });
        await renderCarryPicking();
      } catch (err) {
        await renderCarryPicking(err.message);
      }
    };
  });

  const printBtn = document.getElementById('printBtn');
  printBtn.onclick = async () => {
    try {
      const printable = await api('/api/carry/print');
      openPrintWindow(carryPrintHtml(printable));
    } catch (err) {
      await renderCarryPicking(err.message);
    }
  };

  const completeAllBtn = document.getElementById('completeAllBtn');
  completeAllBtn.onclick = async () => {
    try {
      const result = await api('/api/carry/complete-all', { method: 'POST' });
      navigate('/carry');
      setTimeout(() => renderCarryCategories(result.message).catch(() => {}), 0);
    } catch (err) {
      await renderCarryPicking(err.message);
    }
  };

  addTimer(setInterval(() => {
    if (window.location.pathname === '/carry/picking') {
      renderCarryPicking().catch(() => {});
    }
  }, 7000));
}

async function renderPriceCheckCategories(note = '') {
  const categoriesResult = await api('/api/price-check/categories');
  const categories = categoriesResult.categories;

  app.innerHTML = `
    <div class="page">
      ${renderTop('Проверка ценников', 'Отдельные блокировки категорий')}
      <div class="card">
        <div class="row row-between">
          <button class="btn btn-light" data-nav="/">На главную</button>
          <button class="btn btn-light" data-nav="/price-check/report">Отчёт</button>
        </div>
        <div class="list">${categories.map((item) => categoryRow(item, '/price-check')).join('')}</div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
    </div>
  `;

  bindLogoutButton();
  attachNavHandlers();

  document.querySelectorAll('[data-open]').forEach((element) => {
    element.onclick = async () => {
      const path = element.dataset.open;
      const categoryId = Number(path.split('/').at(-1));
      try {
        await api(`/api/price-check/categories/${categoryId}/lock`, { method: 'POST' });
        navigate(path);
      } catch (err) {
        await renderPriceCheckCategories(err.message);
      }
    };
  });

  document.querySelectorAll('[data-unlock]').forEach((element) => {
    element.onclick = async () => {
      try {
        await api(`/api/price-check/categories/${element.dataset.unlock}/unlock`, { method: 'POST' });
        await renderPriceCheckCategories('Категория разблокирована');
      } catch (err) {
        await renderPriceCheckCategories(err.message);
      }
    };
  });

  addTimer(setInterval(() => {
    if (window.location.pathname === '/price-check') {
      renderPriceCheckCategories().catch(() => {});
    }
  }, 6000));
}

async function renderPriceCheckCategory(categoryId, options = {}) {
  const { lockOnEnter = true, note = '' } = options;
  if (lockOnEnter) {
    await api(`/api/price-check/categories/${categoryId}/lock`, { method: 'POST' });
  }
  const data = await api(`/api/price-check/category/${categoryId}/products`);

  app.innerHTML = `
    <div class="page">
      ${renderTop(data.category.name, 'Выберите: Нет товара / Нет ценника')}
      <div class="card">
        <div class="row row-between">
          <button class="btn btn-light" data-nav="/price-check">Назад</button>
          <div class="row">
            <button id="unlockBtn" class="btn btn-light">Разблокировать категорию</button>
            <button id="completeBtn" class="btn btn-green">Подтвердить проверку категории</button>
          </div>
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
      <div class="grid products-grid">
        ${data.products.map((item) => productCard(item, 'price')).join('')}
      </div>
    </div>
  `;

  bindLogoutButton();
  attachNavHandlers();

  const completeBtn = document.getElementById('completeBtn');
  completeBtn.onclick = async () => {
    try {
      await api(`/api/price-check/categories/${categoryId}/complete`, { method: 'POST' });
      navigate('/price-check');
    } catch (err) {
      await renderPriceCheckCategory(categoryId, { lockOnEnter: false, note: err.message });
    }
  };

  const unlockBtn = document.getElementById('unlockBtn');
  unlockBtn.onclick = async () => {
    try {
      await api(`/api/price-check/categories/${categoryId}/unlock`, { method: 'POST' });
      navigate('/price-check');
    } catch (err) {
      await renderPriceCheckCategory(categoryId, { lockOnEnter: false, note: err.message });
    }
  };

  document.querySelectorAll('[data-toggle-stock]').forEach((element) => {
    element.onclick = async () => {
      try {
        await api(`/api/price-check/items/${element.dataset.toggleStock}/toggle-no-stock`, { method: 'POST' });
        await renderPriceCheckCategory(categoryId, { lockOnEnter: false });
      } catch (err) {
        await renderPriceCheckCategory(categoryId, { lockOnEnter: false, note: err.message });
      }
    };
  });

  document.querySelectorAll('[data-toggle-tag]').forEach((element) => {
    element.onclick = async () => {
      try {
        await api(`/api/price-check/items/${element.dataset.toggleTag}/toggle-no-price-tag`, { method: 'POST' });
        await renderPriceCheckCategory(categoryId, { lockOnEnter: false });
      } catch (err) {
        await renderPriceCheckCategory(categoryId, { lockOnEnter: false, note: err.message });
      }
    };
  });

  addTimer(setInterval(() => {
    if (window.location.pathname === `/price-check/${categoryId}`) {
      api(`/api/price-check/categories/${categoryId}/heartbeat`, { method: 'POST' }).catch(() => {});
    }
  }, 20000));

  addTimer(setInterval(() => {
    if (window.location.pathname === `/price-check/${categoryId}`) {
      renderPriceCheckCategory(categoryId, { lockOnEnter: false }).catch(() => {});
    }
  }, 7000));
}

async function renderPriceCheckReport(note = '') {
  const data = await api('/api/price-check/report');
  app.innerHTML = `
    <div class="page">
      ${renderTop('Отчёт проверки ценников')}
      <div class="card">
        <div class="row row-between">
          <button class="btn btn-light" data-nav="/price-check">Назад</button>
          <button id="printBtn" class="btn">Печать формы</button>
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
      ${data.categories.length === 0 ? '<div class="card">Нет отмеченных товаров</div>' : ''}
      ${data.categories.map((category) => `
        <div class="card">
          <h2>${escapeHtml(category.categoryName)}</h2>
          <div class="list">
            ${category.items.map((item) => `
              <div class="list-item">
                <div>
                  <div class="item-title">${escapeHtml(item.name)}</div>
                  <div class="subtitle">${item.noStock ? 'Нет товара' : ''}${item.noStock && item.noPriceTag ? ', ' : ''}${item.noPriceTag ? 'Нет ценника' : ''}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  bindLogoutButton();
  attachNavHandlers();

  const printBtn = document.getElementById('printBtn');
  printBtn.onclick = async () => {
    try {
      const printable = await api('/api/price-check/print');
      openPrintWindow(priceCheckPrintHtml(printable));
    } catch (err) {
      await renderPriceCheckReport(err.message);
    }
  };
}

async function renderProductCheck() {
  const data = await api('/api/product-check/no-barcode');
  const grouped = new Map();
  for (const product of data.products) {
    if (!grouped.has(product.categoryId)) {
      grouped.set(product.categoryId, { categoryName: product.categoryName, items: [] });
    }
    grouped.get(product.categoryId).items.push(product);
  }
  const categories = Array.from(grouped.values());

  app.innerHTML = `
    <div class="page">
      ${renderTop('Проверка товара', `Нет штрих-кода: ${data.products.length}`)}
      <div class="card">
        <div class="row row-between">
          <button class="btn btn-light" data-nav="/">На главную</button>
        </div>
      </div>
      ${categories.length === 0 ? '<div class="card">Все товары содержат штрих-код</div>' : ''}
      ${categories.map((group) => `
        <div class="card">
          <h2>${escapeHtml(group.categoryName)}</h2>
          <div class="list">
            ${group.items.map((item) => `
              <div class="list-item">
                <div>
                  <div class="item-title">${escapeHtml(item.name)}</div>
                  <div class="subtitle">Арт. ${escapeHtml(item.vendorCode)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
  bindLogoutButton();
  attachNavHandlers();
}

function userRow(user) {
  return `
    <div class="list-item">
      <div class="item-col grow">
        <input class="input" id="login-${user.id}" value="${escapeHtml(user.login)}" />
        <div class="row">
          <select class="input" id="role-${user.id}">
            <option value="staff" ${user.role === 'staff' ? 'selected' : ''}>staff</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
          </select>
          <input class="input" id="pass-${user.id}" placeholder="Новый пароль (опц.)" />
        </div>
      </div>
      <div class="item-col">
        <button class="btn btn-small" data-save-user="${user.id}">Сохранить</button>
        <button class="btn btn-small ${user.isActive ? 'btn-light' : 'btn-green'}" data-toggle-user="${user.id}">
          ${user.isActive ? 'Отключить' : 'Включить'}
        </button>
      </div>
    </div>
  `;
}

async function renderAdmin(note = '') {
  if (state.me?.role !== 'admin') {
    navigate('/');
    return;
  }

  const [usersData, locksData] = await Promise.all([
    api('/api/admin/users'),
    api('/api/admin/locks'),
  ]);

  app.innerHTML = `
    <div class="page">
      ${renderTop('Админка', 'Сотрудники, блокировки и сервисные действия')}
      <div class="card">
        <div class="row row-between">
          <button class="btn btn-light" data-nav="/">На главную</button>
          <div class="row">
            <button id="clearCacheBtn" class="btn btn-light">Очистка кэша картинок</button>
            <button id="syncResetBtn" class="btn btn-light">Сброс синка</button>
          </div>
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>

      <div class="card">
        <h2>Добавить сотрудника</h2>
        <div class="row wrap">
          <input id="newLogin" class="input" placeholder="Логин" />
          <input id="newPassword" class="input" placeholder="Пароль" />
          <select id="newRole" class="input">
            <option value="staff">staff</option>
            <option value="admin">admin</option>
          </select>
          <button id="createUserBtn" class="btn">Создать</button>
        </div>
      </div>

      <div class="card">
        <h2>Сотрудники</h2>
        <div class="list">${usersData.users.map((user) => userRow(user)).join('')}</div>
      </div>

      <div class="card">
        <h2>Зависшие блокировки</h2>
        ${locksData.locks.length === 0 ? '<div class="subtitle">Нет активных блокировок</div>' : ''}
        <div class="list">
          ${locksData.locks.map((lock) => `
            <div class="list-item">
              <div>
                <div class="item-title">${escapeHtml(lock.module)} · ${escapeHtml(lock.categoryName)}</div>
                <div class="subtitle">Сотрудник: ${escapeHtml(lock.lockedByLogin || '—')}</div>
              </div>
              <button class="btn btn-light" data-unlock-module="${escapeHtml(lock.module)}" data-unlock-category="${lock.categoryId}">
                Разблокировать
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  bindLogoutButton();
  attachNavHandlers();

  const createUserBtn = document.getElementById('createUserBtn');
  createUserBtn.onclick = async () => {
    const login = document.getElementById('newLogin').value.trim();
    const password = document.getElementById('newPassword').value.trim();
    const role = document.getElementById('newRole').value;
    try {
      const result = await api('/api/admin/users', {
        method: 'POST',
        body: { login, password, role },
      });
      await renderAdmin(result.message || 'Пользователь создан');
    } catch (err) {
      await renderAdmin(err.message);
    }
  };

  document.querySelectorAll('[data-save-user]').forEach((element) => {
    element.onclick = async () => {
      const userId = Number(element.dataset.saveUser);
      const login = document.getElementById(`login-${userId}`).value.trim();
      const role = document.getElementById(`role-${userId}`).value;
      const password = document.getElementById(`pass-${userId}`).value.trim();
      try {
        const body = { login, role };
        if (password) body.password = password;
        const result = await api(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          body,
        });
        await renderAdmin(result.message || 'Пользователь обновлён');
      } catch (err) {
        await renderAdmin(err.message);
      }
    };
  });

  document.querySelectorAll('[data-toggle-user]').forEach((element) => {
    element.onclick = async () => {
      try {
        const result = await api(`/api/admin/users/${element.dataset.toggleUser}/toggle-active`, {
          method: 'POST',
        });
        await renderAdmin(result.message);
      } catch (err) {
        await renderAdmin(err.message);
      }
    };
  });

  document.querySelectorAll('[data-unlock-module]').forEach((element) => {
    element.onclick = async () => {
      try {
        const result = await api('/api/admin/unlock-category', {
          method: 'POST',
          body: {
            module: element.dataset.unlockModule,
            categoryId: Number(element.dataset.unlockCategory),
          },
        });
        await renderAdmin(result.message);
      } catch (err) {
        await renderAdmin(err.message);
      }
    };
  });

  const clearCacheBtn = document.getElementById('clearCacheBtn');
  clearCacheBtn.onclick = async () => {
    try {
      const result = await api('/api/admin/clear-image-cache', { method: 'POST' });
      await renderAdmin(result.message);
    } catch (err) {
      await renderAdmin(err.message);
    }
  };

  const syncResetBtn = document.getElementById('syncResetBtn');
  syncResetBtn.onclick = async () => {
    try {
      const result = await api('/api/sync-reset', { method: 'POST' });
      await renderAdmin(result.message);
    } catch (err) {
      await renderAdmin(err.message);
    }
  };

  addTimer(setInterval(() => {
    if (window.location.pathname === '/admin') {
      renderAdmin().catch(() => {});
    }
  }, 8000));
}

async function renderRoute() {
  stopTimers();
  const pathname = window.location.pathname;

  if (pathname === '/login') {
    renderLogin();
    return;
  }

  if (!state.token) {
    navigate('/login', true);
    return;
  }

  if (!state.me) {
    try {
      await loadMe();
    } catch {
      state.token = '';
      state.me = null;
      localStorage.removeItem('zanToken');
      navigate('/login', true);
      return;
    }
  }

  if (pathname === '/') {
    await renderHome();
    return;
  }
  if (pathname === '/carry') {
    await renderCarryCategories();
    return;
  }
  if (pathname === '/carry/picking') {
    await renderCarryPicking();
    return;
  }
  if (/^\/carry\/\d+$/.test(pathname)) {
    const categoryId = Number(pathname.split('/').at(-1));
    await renderCarryCategory(categoryId);
    return;
  }
  if (pathname === '/price-check') {
    await renderPriceCheckCategories();
    return;
  }
  if (pathname === '/price-check/report') {
    await renderPriceCheckReport();
    return;
  }
  if (/^\/price-check\/\d+$/.test(pathname)) {
    const categoryId = Number(pathname.split('/').at(-1));
    await renderPriceCheckCategory(categoryId);
    return;
  }
  if (pathname === '/product-check') {
    await renderProductCheck();
    return;
  }
  if (pathname === '/admin') {
    await renderAdmin();
    return;
  }

  navigate('/', true);
}

window.addEventListener('popstate', () => {
  renderRoute().catch((error) => renderFatal(error));
});

window.addEventListener('beforeunload', stopTimers);

renderRoute().catch((error) => renderFatal(error));
