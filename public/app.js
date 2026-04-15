const state = {
  token: localStorage.getItem('zanToken') || '',
  me: null,
  timers: [],
  loginDraft: 'admin',
  passwordDraft: '7895123',
  installPrompt: null,
  pushReady: false,
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

function authHeaders(headers = {}) {
  const merged = { ...headers };
  if (state.token) merged.Authorization = `Bearer ${state.token}`;
  return merged;
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

function navigate(path, replace = false) {
  if (window.location.pathname === path) return;
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  renderRoute().catch(renderErrorScreen);
}

function pageWrapper(title, subtitle = '', body = '') {
  return `
    <div class="page">
      <header class="top-card">
        <div>
          <div class="brand">ZAN 1.1</div>
          <h1>${escapeHtml(title)}</h1>
          ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
        </div>
        <div class="top-actions">
          ${state.me ? `<span class="pill">${escapeHtml(state.me.login)} · ${escapeHtml(state.me.role)}</span>` : ''}
          ${state.me ? '<button class="btn btn-light" id="logoutBtn">Выйти</button>' : ''}
        </div>
      </header>
      ${body}
    </div>
  `;
}

function bindCommonButtons() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
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

  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.onclick = () => navigate(el.dataset.nav);
  });
}

function renderErrorScreen(error) {
  app.innerHTML = `
    <div class="page center">
      <div class="card">
        <h2>Ошибка</h2>
        <div class="notice danger">${escapeHtml(error?.message || 'Неизвестная ошибка')}</div>
        <button class="btn" id="retryBtn">Повторить</button>
      </div>
    </div>
  `;
  const retryBtn = document.getElementById('retryBtn');
  if (retryBtn) retryBtn.onclick = () => renderRoute().catch(renderErrorScreen);
}

async function ensureMe() {
  if (!state.token) return null;
  const data = await api('/api/me');
  state.me = data.user;
  return state.me;
}

function imageSrc(item) {
  return item.cachedImage || '';
}

function carryPrintHtml(payload) {
  const dateText = new Date(payload.generatedAt || Date.now()).toLocaleString('ru-RU');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Заявка на занос</title>
  <style>body{font-family:Arial,sans-serif;margin:20px}table{width:100%;border-collapse:collapse;margin-bottom:14px}
  th,td{border:1px solid #ddd;padding:8px}th:last-child,td:last-child{width:120px;text-align:center}.cat{font-weight:700;margin:12px 0 8px}</style>
  </head><body><h1>Заявка на занос</h1><div>Дата и время: ${escapeHtml(dateText)}</div>
  ${payload.categories.map((group) => `
    <div class="cat">${escapeHtml(group.categoryName)}</div>
    <table><thead><tr><th>Товар</th><th>Количество</th></tr></thead><tbody>
      ${group.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.qty)}</td></tr>`).join('')}
    </tbody></table>
  `).join('')}
  </body></html>`;
}

function pricePrintHtml(payload) {
  const dateText = new Date(payload.generatedAt || Date.now()).toLocaleString('ru-RU');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Проверка ценников</title>
  <style>body{font-family:Arial,sans-serif;margin:20px}table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #ddd;padding:8px}</style></head><body>
  <h1>Проверка ценников</h1><div>Дата и время: ${escapeHtml(dateText)}</div>
  <table><thead><tr><th>Название</th><th>Артикул</th><th>Статус</th></tr></thead><tbody>
    ${payload.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.vendorCode)}</td><td>${escapeHtml(item.status)}</td></tr>`).join('')}
  </tbody></table></body></html>`;
}

function openPrintHtml(html) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 220);
}

function registerInstallPromptHandlers() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    const installBtn = document.getElementById('installBtn');
    if (installBtn) installBtn.hidden = false;
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch {}
}

async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push не поддерживается');
  }
  const configData = await api('/api/push/config');
  if (!configData.configured || !configData.publicKey) {
    throw new Error('Push-сервер не настроен (нет VAPID ключей)');
  }
  const reg = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Разрешение на уведомления не выдано');
  const key = configData.publicKey.replace(/-/g, '+').replace(/_/g, '/');
  const keyData = Uint8Array.from(atob(key), (ch) => ch.charCodeAt(0));
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyData,
  });
  await api('/api/push/subscribe', {
    method: 'POST',
    body: { subscription: subscription.toJSON() },
  });
}

function renderLogin(error = '') {
  stopTimers();
  app.innerHTML = `
    <div class="page center">
      <div class="card login-card">
        <div class="brand">ZAN 1.1</div>
        <h1>Вход</h1>
        <label>Логин <input id="loginInput" value="${escapeHtml(state.loginDraft)}" /></label>
        <label>Пароль <input id="passwordInput" type="password" value="${escapeHtml(state.passwordDraft)}" /></label>
        <button class="btn block" id="loginBtn">Войти</button>
        ${error ? `<div class="notice danger">${escapeHtml(error)}</div>` : ''}
      </div>
    </div>
  `;
  const loginBtn = document.getElementById('loginBtn');
  loginBtn.onclick = async () => {
    state.loginDraft = document.getElementById('loginInput').value.trim();
    state.passwordDraft = document.getElementById('passwordInput').value.trim();
    try {
      const result = await api('/api/login', {
        method: 'POST',
        body: { login: state.loginDraft, password: state.passwordDraft },
      });
      state.token = result.token;
      state.me = result.user;
      localStorage.setItem('zanToken', state.token);
      navigate('/', true);
    } catch (errorLogin) {
      renderLogin(errorLogin.message);
    }
  };
}

function weekDayName(index) {
  return ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'][index] || '';
}

async function renderHome(note = '') {
  const stateData = await api('/api/state');
  const sync = stateData.state.sync || {};
  const calendar = stateData.state.calendar || { days: [] };
  app.innerHTML = pageWrapper(
    'Главная',
    'Сервис сотрудников склада/магазина',
    `
      <div class="grid tiles">
        <button class="tile" data-nav="/carry">Заявка на занос</button>
        <button class="tile" data-nav="/price-check">Проверка ценников</button>
        <button class="tile" data-nav="/product-check">Проверка товара</button>
        <button class="tile" data-nav="/calendar">Календарь недели</button>
        ${state.me?.role === 'admin' ? '<button class="tile" data-nav="/admin">Админка</button>' : ''}
      </div>

      <div class="card">
        <div class="row between">
          <h2>Каталог</h2>
          <div class="pill">${Number(sync.progress || 0)}%</div>
        </div>
        <div class="subtitle">${escapeHtml(sync.message || 'Ожидание')}</div>
        <div class="row wrap">
          <button class="btn" id="syncBtn" ${sync.running ? 'disabled' : ''}>Обновить каталог</button>
          ${state.me?.role === 'admin' ? '<button class="btn btn-light" id="syncResetBtn">Сбросить обновление</button>' : ''}
          <button class="btn btn-light" id="installBtn" ${state.installPrompt ? '' : 'hidden'}>Установить на мобильный</button>
          <button class="btn btn-light" id="pushSubscribeBtn">Включить push на устройстве</button>
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>

      <div class="card">
        <h2>Календарь недели</h2>
        <div class="week-grid">
          ${calendar.days.map((day, idx) => `
            <div class="day-box">
              <div class="day-title">${weekDayName(idx)} · ${escapeHtml(day.date.slice(5))}</div>
              ${day.items.length === 0 ? '<div class="subtitle">—</div>' : ''}
              ${day.items.map((item) => `<div class="day-item"><b>${escapeHtml(item.title)}</b><br>${escapeHtml(item.text || '')}</div>`).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `,
  );

  bindCommonButtons();

  document.getElementById('syncBtn').onclick = async () => {
    try {
      const result = await api('/api/catalog/sync-yml', { method: 'POST' });
      await renderHome(result.message || 'Синхронизация запущена');
    } catch (errorSync) {
      await renderHome(errorSync.message);
    }
  };

  const resetBtn = document.getElementById('syncResetBtn');
  if (resetBtn) {
    resetBtn.onclick = async () => {
      try {
        const result = await api('/api/catalog/sync-reset', { method: 'POST' });
        await renderHome(result.message || 'Сброс выполнен');
      } catch (errorReset) {
        await renderHome(errorReset.message);
      }
    };
  }

  const installBtn = document.getElementById('installBtn');
  if (installBtn) {
    installBtn.onclick = async () => {
      if (!state.installPrompt) return;
      state.installPrompt.prompt();
      await state.installPrompt.userChoice;
      state.installPrompt = null;
      installBtn.hidden = true;
    };
  }

  const pushBtn = document.getElementById('pushSubscribeBtn');
  if (pushBtn) {
    pushBtn.onclick = async () => {
      try {
        await subscribePush();
        await renderHome('Push включён на устройстве');
      } catch (errorPush) {
        await renderHome(errorPush.message);
      }
    };
  }

  addTimer(setInterval(() => {
    if (window.location.pathname === '/') renderHome().catch(() => {});
  }, 7000));
}

async function renderCarry(note = '') {
  const result = await api('/api/carry/categories');
  app.innerHTML = pageWrapper(
    'Заявка на занос',
    'Работа без блокировок — одновременно для всех сотрудников',
    `
      <div class="card">
        <div class="row between">
          <button class="btn btn-light" data-nav="/">На главную</button>
          <button class="btn btn-green" data-nav="/carry/picking">Сборка заявки</button>
        </div>
      </div>
      <div class="card">
        <div class="list">
          ${result.categories.map((category) => `
            <div class="list-item">
              <div>
                <div class="item-title">${escapeHtml(category.name)}</div>
                <div class="subtitle">${category.confirmedAt ? `Подтверждена: ${new Date(category.confirmedAt).toLocaleString('ru-RU')}` : 'Не подтверждена'}</div>
              </div>
              <button class="btn" data-nav="/carry/${category.id}">Открыть</button>
            </div>
          `).join('')}
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
    `,
  );
  bindCommonButtons();
}

function carryCard(item) {
  const image = imageSrc(item);
  return `
    <div class="product-card" data-inc="${item.id}">
      <div class="product-image">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy" />` : '<div class="img-empty">Нет фото</div>'}
        <button class="qty-circle" ${item.qty > 0 ? `data-dec="${item.id}"` : 'disabled'}>${item.qty > 0 ? item.qty : '+'}</button>
      </div>
      <div class="product-name">${escapeHtml(item.name)}</div>
      <div class="subtitle small">Арт. ${escapeHtml(item.vendorCode)}</div>
    </div>
  `;
}

async function renderCarryCategory(categoryId, note = '') {
  const payload = await api(`/api/carry/category/${categoryId}/products`);
  app.innerHTML = pageWrapper(
    payload.category.name,
    'Клик по карточке +1 (для 1/... шаг = 5), клик по кругу -1',
    `
      <div class="card">
        <div class="row between">
          <button class="btn btn-light" data-nav="/carry">Назад</button>
          <button class="btn btn-green" id="confirmCarryBtn">Подтвердить заявку категории</button>
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
      <div class="grid products-grid">${payload.products.map(carryCard).join('')}</div>
    `,
  );
  bindCommonButtons();

  const confirmBtn = document.getElementById('confirmCarryBtn');
  confirmBtn.onclick = async () => {
    try {
      await api(`/api/carry/categories/${categoryId}/complete`, { method: 'POST' });
      navigate('/carry');
    } catch (errorConfirm) {
      await renderCarryCategory(categoryId, errorConfirm.message);
    }
  };

  document.querySelectorAll('[data-inc]').forEach((el) => {
    el.onclick = async () => {
      try {
        await api(`/api/carry/items/${el.dataset.inc}/increment`, { method: 'POST' });
        await renderCarryCategory(categoryId);
      } catch (errorInc) {
        await renderCarryCategory(categoryId, errorInc.message);
      }
    };
  });

  document.querySelectorAll('[data-dec]').forEach((el) => {
    el.onclick = async (event) => {
      event.stopPropagation();
      try {
        await api(`/api/carry/items/${el.dataset.dec}/decrement`, { method: 'POST' });
        await renderCarryCategory(categoryId);
      } catch (errorDec) {
        await renderCarryCategory(categoryId, errorDec.message);
      }
    };
  });
}

async function renderCarryPicking(note = '') {
  const payload = await api('/api/carry/picking');
  app.innerHTML = pageWrapper(
    'Сборка заявки',
    `Собрано ${payload.pickedItems} из ${payload.totalItems}`,
    `
      <div class="card">
        <div class="row between wrap">
          <button class="btn btn-light" data-nav="/carry">Назад</button>
          <div class="row wrap">
            <button class="btn btn-light" id="printCarryBtn">Печать формы</button>
            <button class="btn btn-green" id="completeCarryOrderBtn">Заявка собрана полностью</button>
          </div>
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>

      ${payload.categories.length === 0 ? '<div class="card">Товаров с qty &gt; 0 нет</div>' : ''}
      ${payload.categories.map((group) => `
        <div class="card">
          <h2>${escapeHtml(group.categoryName)}</h2>
          <div class="list">
            ${group.items.map((item) => `
              <div class="list-item">
                <div>
                  <div class="item-title">${escapeHtml(item.name)}</div>
                  <div class="subtitle">Арт. ${escapeHtml(item.vendorCode)} · Кол-во: ${item.qty}</div>
                </div>
                <button class="btn ${item.picked ? 'btn-green' : 'btn-light'}" data-toggle-picked="${item.productId}">
                  ${item.picked ? 'Собран' : 'Отметить'}
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    `,
  );
  bindCommonButtons();

  document.querySelectorAll('[data-toggle-picked]').forEach((el) => {
    el.onclick = async () => {
      try {
        await api(`/api/carry/items/${el.dataset.togglePicked}/toggle-picked`, { method: 'POST' });
        await renderCarryPicking();
      } catch (errorPicked) {
        await renderCarryPicking(errorPicked.message);
      }
    };
  });

  document.getElementById('printCarryBtn').onclick = async () => {
    try {
      const printable = await api('/api/carry/print');
      openPrintHtml(carryPrintHtml(printable));
    } catch (errorPrint) {
      await renderCarryPicking(errorPrint.message);
    }
  };

  document.getElementById('completeCarryOrderBtn').onclick = async () => {
    try {
      const result = await api('/api/carry/complete-all', { method: 'POST' });
      navigate('/carry');
      setTimeout(() => renderCarry(result.message || 'Готово').catch(() => {}), 0);
    } catch (errorComplete) {
      await renderCarryPicking(errorComplete.message);
    }
  };

  addTimer(setInterval(() => {
    if (window.location.pathname === '/carry/picking') renderCarryPicking().catch(() => {});
  }, 7000));
}

async function renderPriceCheckRoot(note = '') {
  const result = await api('/api/price-check/categories');
  app.innerHTML = pageWrapper(
    'Проверка ценников',
    'Товары разбиты на страницы по 50',
    `
      <div class="card">
        <div class="row between">
          <button class="btn btn-light" data-nav="/">На главную</button>
          <button class="btn btn-light" data-nav="/price-check/report">Отчёт и печать</button>
        </div>
      </div>
      <div class="card">
        <div class="list">
          ${result.categories.map((category) => `
            <div class="list-item">
              <div>
                <div class="item-title">${escapeHtml(category.categoryName)}</div>
                <div class="subtitle">Страниц: ${category.pagesCount}</div>
              </div>
              <button class="btn" data-nav="/price-check/${category.categoryId}">Страницы</button>
            </div>
          `).join('')}
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
    `,
  );
  bindCommonButtons();
}

async function renderPriceCheckPages(categoryId, note = '') {
  const [cats, pagesData] = await Promise.all([
    api('/api/price-check/categories'),
    api(`/api/price-check/categories/${categoryId}/pages`),
  ]);
  const category = cats.categories.find((item) => Number(item.categoryId) === Number(categoryId));
  const pages = pagesData.pages || [];
  app.innerHTML = pageWrapper(
    category ? category.categoryName : 'Страницы',
    'Начальный экран: только страницы',
    `
      <div class="card">
        <div class="row between">
          <button class="btn btn-light" data-nav="/price-check">Назад</button>
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
      <div class="card">
        <div class="pages-grid">
          ${pages.map((page) => `
            <button class="page-btn ${page.lockedBy && !page.isLockedByMe ? 'locked' : ''}" data-open-page="${page.pageNumber}">
              <span>Страница ${page.pageNumber}</span>
              <small>
                ${page.lockedBy && !page.isLockedByMe
                  ? `Занято: ${escapeHtml(page.lockedByLogin || 'сотрудник')}`
                  : page.completedAt ? 'Проверена' : 'Свободна'}
              </small>
            </button>
          `).join('')}
        </div>
      </div>
    `,
  );
  bindCommonButtons();

  document.querySelectorAll('[data-open-page]').forEach((el) => {
    el.onclick = async () => {
      const pageNumber = Number(el.dataset.openPage);
      try {
        await api(`/api/price-check/pages/${categoryId}/${pageNumber}/lock`, { method: 'POST' });
        navigate(`/price-check/${categoryId}/${pageNumber}`);
      } catch (errorOpen) {
        await renderPriceCheckPages(categoryId, errorOpen.message);
      }
    };
  });

  addTimer(setInterval(() => {
    if (window.location.pathname === `/price-check/${categoryId}`) renderPriceCheckPages(categoryId).catch(() => {});
  }, 6000));
}

function priceCard(item) {
  const image = imageSrc(item);
  return `
    <div class="product-card">
      <div class="product-image">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy" />` : '<div class="img-empty">Нет фото</div>'}
      </div>
      <div class="product-name">${escapeHtml(item.name)}</div>
      <div class="subtitle small">Арт. ${escapeHtml(item.vendorCode)}</div>
      <div class="row wrap">
        <button class="btn btn-small ${item.problem ? 'btn-red' : 'btn-light'}" data-toggle-problem="${item.id}">Проблема</button>
        <button class="btn btn-small ${item.price ? 'btn-yellow' : 'btn-light'}" data-toggle-price="${item.id}">Ценник</button>
      </div>
    </div>
  `;
}

async function renderPriceCheckPage(categoryId, pageNumber, note = '') {
  try {
    await api(`/api/price-check/pages/${categoryId}/${pageNumber}/lock`, { method: 'POST' });
  } catch (errorLock) {
    await renderPriceCheckPages(categoryId, errorLock.message);
    return;
  }

  const productsData = await api(`/api/price-check/pages/${categoryId}/${pageNumber}/products`);
  app.innerHTML = pageWrapper(
    `Страница ${pageNumber}`,
    'Проблема / Ценник — переключатели',
    `
      <div class="card">
        <div class="row between wrap">
          <button class="btn btn-light" data-nav="/price-check/${categoryId}">Назад</button>
          <div class="row wrap">
            <button class="btn btn-light" id="unlockPageBtn">Разблокировать</button>
            <button class="btn btn-green" id="completePageBtn">Подтвердить страницу</button>
          </div>
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
      <div class="grid products-grid">${productsData.products.map(priceCard).join('')}</div>
    `,
  );
  bindCommonButtons();

  document.getElementById('unlockPageBtn').onclick = async () => {
    try {
      await api(`/api/price-check/pages/${categoryId}/${pageNumber}/unlock`, { method: 'POST' });
      navigate(`/price-check/${categoryId}`);
    } catch (errorUnlock) {
      await renderPriceCheckPage(categoryId, pageNumber, errorUnlock.message);
    }
  };

  document.getElementById('completePageBtn').onclick = async () => {
    try {
      await api(`/api/price-check/pages/${categoryId}/${pageNumber}/complete`, { method: 'POST' });
      navigate(`/price-check/${categoryId}`);
    } catch (errorComplete) {
      await renderPriceCheckPage(categoryId, pageNumber, errorComplete.message);
    }
  };

  document.querySelectorAll('[data-toggle-problem]').forEach((el) => {
    el.onclick = async () => {
      try {
        await api(`/api/price-check/items/${el.dataset.toggleProblem}/toggle-problem`, { method: 'POST' });
        await renderPriceCheckPage(categoryId, pageNumber);
      } catch (errorProblem) {
        await renderPriceCheckPage(categoryId, pageNumber, errorProblem.message);
      }
    };
  });

  document.querySelectorAll('[data-toggle-price]').forEach((el) => {
    el.onclick = async () => {
      try {
        await api(`/api/price-check/items/${el.dataset.togglePrice}/toggle-price`, { method: 'POST' });
        await renderPriceCheckPage(categoryId, pageNumber);
      } catch (errorPrice) {
        await renderPriceCheckPage(categoryId, pageNumber, errorPrice.message);
      }
    };
  });

  addTimer(setInterval(() => {
    if (window.location.pathname === `/price-check/${categoryId}/${pageNumber}`) {
      api(`/api/price-check/pages/${categoryId}/${pageNumber}/heartbeat`, { method: 'POST' }).catch(() => {});
    }
  }, 20000));
}

async function renderPriceCheckReport(note = '') {
  const report = await api('/api/price-check/report');
  app.innerHTML = pageWrapper(
    'Отчёт проверки ценников',
    'Печать без категорий: название / артикул / статус',
    `
      <div class="card">
        <div class="row between">
          <button class="btn btn-light" data-nav="/price-check">Назад</button>
          <button class="btn" id="printPriceBtn">Печать формы</button>
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
      <div class="card">
        ${report.items.length === 0 ? '<div class="subtitle">Отмеченных позиций нет</div>' : ''}
        <div class="list">
          ${report.items.map((item) => `
            <div class="list-item">
              <div>
                <div class="item-title">${escapeHtml(item.name)}</div>
                <div class="subtitle">Арт. ${escapeHtml(item.vendorCode)} · ${escapeHtml(item.status)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `,
  );
  bindCommonButtons();

  document.getElementById('printPriceBtn').onclick = async () => {
    try {
      const printable = await api('/api/price-check/print');
      openPrintHtml(pricePrintHtml(printable));
    } catch (errorPrint) {
      await renderPriceCheckReport(errorPrint.message);
    }
  };
}

async function renderProductCheck(note = '') {
  const payload = await api('/api/product-check/no-barcode');
  app.innerHTML = pageWrapper(
    'Проверка товара',
    `Без штрих-кода: ${payload.products.length}`,
    `
      <div class="card">
        <div class="row between"><button class="btn btn-light" data-nav="/">На главную</button></div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
      <div class="card">
        ${payload.products.length === 0 ? '<div class="subtitle">Все товары содержат штрих-код</div>' : ''}
        <div class="list">
          ${payload.products.map((item) => `
            <div class="list-item">
              <div>
                <div class="item-title">${escapeHtml(item.name)}</div>
                <div class="subtitle">${escapeHtml(item.categoryName)} · Арт. ${escapeHtml(item.vendorCode)}</div>
              </div>
              <button class="btn btn-red" data-hide-product="${item.id}">−</button>
            </div>
          `).join('')}
        </div>
      </div>
    `,
  );
  bindCommonButtons();

  document.querySelectorAll('[data-hide-product]').forEach((el) => {
    el.onclick = async () => {
      try {
        await api(`/api/product-check/items/${el.dataset.hideProduct}/hide`, { method: 'POST' });
        await renderProductCheck('Товар скрыт из списка');
      } catch (errorHide) {
        await renderProductCheck(errorHide.message);
      }
    };
  });
}

async function renderCalendar(note = '') {
  const data = await api('/api/calendar/week');
  app.innerHTML = pageWrapper(
    'Календарь недели',
    `${data.startDate} — ${data.endDate}`,
    `
      <div class="card">
        <div class="row between"><button class="btn btn-light" data-nav="/">На главную</button></div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>
      <div class="week-grid">
        ${data.days.map((day, index) => `
          <div class="card">
            <h3>${weekDayName(index)} · ${escapeHtml(day.date)}</h3>
            ${day.items.length === 0 ? '<div class="subtitle">Нет записей</div>' : ''}
            ${day.items.map((item) => `
              <div class="day-item">
                <b>${escapeHtml(item.title)}</b>
                <div>${escapeHtml(item.text || '')}</div>
                ${state.me?.role === 'admin'
                  ? `<div class="row wrap">
                       <button class="btn btn-small btn-light" data-edit-cal="${item.id}" data-date="${item.date || day.date}" data-title="${escapeHtml(item.title)}" data-text="${escapeHtml(item.text || '')}">Изменить</button>
                       <button class="btn btn-small btn-red" data-del-cal="${item.id}">Удалить</button>
                     </div>`
                  : ''}
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
      ${state.me?.role === 'admin'
        ? `<div class="card">
             <h2>Добавить запись</h2>
             <div class="row wrap">
               <input class="input" id="calendarDate" type="date" value="${escapeHtml(data.startDate)}" />
               <input class="input" id="calendarTitle" placeholder="Заголовок" />
             </div>
             <textarea class="input" id="calendarText" rows="3" placeholder="Текст"></textarea>
             <button class="btn" id="calendarCreateBtn">Добавить</button>
           </div>`
        : ''}
    `,
  );
  bindCommonButtons();

  if (state.me?.role === 'admin') {
    const createBtn = document.getElementById('calendarCreateBtn');
    createBtn.onclick = async () => {
      try {
        await api('/api/calendar/items', {
          method: 'POST',
          body: {
            date: document.getElementById('calendarDate').value,
            title: document.getElementById('calendarTitle').value,
            text: document.getElementById('calendarText').value,
          },
        });
        await renderCalendar('Запись добавлена');
      } catch (errorCreate) {
        await renderCalendar(errorCreate.message);
      }
    };

    document.querySelectorAll('[data-del-cal]').forEach((el) => {
      el.onclick = async () => {
        try {
          await api(`/api/calendar/items/${el.dataset.delCal}`, { method: 'DELETE' });
          await renderCalendar('Запись удалена');
        } catch (errorDelete) {
          await renderCalendar(errorDelete.message);
        }
      };
    });

    document.querySelectorAll('[data-edit-cal]').forEach((el) => {
      el.onclick = async () => {
        const title = prompt('Новый заголовок', el.dataset.title || '');
        if (title === null) return;
        const text = prompt('Новый текст', el.dataset.text || '');
        if (text === null) return;
        try {
          await api(`/api/calendar/items/${el.dataset.editCal}`, {
            method: 'PATCH',
            body: { title, text },
          });
          await renderCalendar('Запись обновлена');
        } catch (errorEdit) {
          await renderCalendar(errorEdit.message);
        }
      };
    });
  }
}

function userRow(user) {
  return `
    <div class="list-item">
      <div class="grow">
        <input class="input" id="user-login-${user.id}" value="${escapeHtml(user.login)}" />
        <div class="row wrap">
          <select class="input" id="user-role-${user.id}">
            <option value="staff" ${user.role === 'staff' ? 'selected' : ''}>staff</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
          </select>
          <input class="input" id="user-pass-${user.id}" placeholder="Новый пароль (опц.)" />
        </div>
        <div class="subtitle">Последний вход: ${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('ru-RU') : '—'}</div>
      </div>
      <div class="row wrap">
        <button class="btn btn-small" data-user-save="${user.id}">Сохранить</button>
        <button class="btn btn-small ${user.isActive ? 'btn-light' : 'btn-green'}" data-user-toggle="${user.id}">
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
  const [overview, users, sync, locks, rating, problemProducts] = await Promise.all([
    api('/api/admin/overview'),
    api('/api/admin/users'),
    api('/api/catalog/sync-status'),
    api('/api/admin/price-locks'),
    api('/api/stats/monthly-rating'),
    api('/api/admin/problem-products'),
  ]);

  app.innerHTML = pageWrapper(
    'Админка',
    'Обзор, сотрудники, каталог, блокировки, push, статистика',
    `
      <div class="card">
        <div class="row between">
          <button class="btn btn-light" data-nav="/">На главную</button>
          <div class="row wrap">
            <button class="btn btn-light" id="adminSyncBtn">Обновить каталог</button>
            <button class="btn btn-light" id="adminResetSyncBtn">Сбросить обновление</button>
            <button class="btn btn-light" id="adminClearCacheBtn">Очистка кэша</button>
          </div>
        </div>
        ${note ? `<div class="notice">${escapeHtml(note)}</div>` : ''}
      </div>

      <div class="card">
        <h2>1. Обзор</h2>
        <div class="subtitle">Онлайн: ${overview.overview.onlineUsers.map((u) => u.login).join(', ') || '—'}</div>
        <div class="subtitle">Товаров: ${overview.overview.catalog.totalProducts}</div>
        <div class="subtitle">Без штрих-кода: ${overview.overview.catalog.noBarcodeProducts}</div>
        <div class="subtitle">Sync: ${escapeHtml(sync.sync.message || sync.sync.stage || 'idle')}</div>
      </div>

      <div class="card">
        <h2>2. Сотрудники</h2>
        <div class="row wrap">
          <input class="input" id="newUserLogin" placeholder="Логин" />
          <input class="input" id="newUserPassword" placeholder="Пароль" />
          <select class="input" id="newUserRole">
            <option value="staff">staff</option>
            <option value="admin">admin</option>
          </select>
          <button class="btn" id="createUserBtn">Добавить</button>
        </div>
        <div class="list">${users.users.map(userRow).join('')}</div>
      </div>

      <div class="card">
        <h2>3-4. Блокировки price-check pages</h2>
        ${locks.locks.length === 0 ? '<div class="subtitle">Нет блокировок</div>' : ''}
        <div class="list">
          ${locks.locks.map((lock) => `
            <div class="list-item">
              <div>
                <div class="item-title">${escapeHtml(lock.categoryName)} · Страница ${lock.pageNumber}</div>
                <div class="subtitle">Занято: ${escapeHtml(lock.lockedByLogin)}</div>
              </div>
              <button class="btn btn-light" data-unlock-lock="${lock.categoryId}:${lock.pageNumber}">Разблокировать</button>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <h2>5. Push</h2>
        <div class="row wrap">
          <input class="input" id="pushTitle" placeholder="Заголовок" value="ZAN 1.1" />
          <input class="input grow" id="pushText" placeholder="Текст уведомления" />
        </div>
        <div class="row wrap">
          <button class="btn" id="pushAllBtn">Отправить всем</button>
          <input class="input" id="pushUserId" placeholder="ID сотрудника" />
          <button class="btn btn-light" id="pushOneBtn">Отправить одному</button>
        </div>
      </div>

      <div class="card">
        <h2>6. Статистика (рейтинг месяца)</h2>
        <div class="list">
          ${rating.items.map((item) => `
            <div class="list-item">
              <div class="item-title">#${item.rank} ${escapeHtml(item.login)}</div>
              <div class="subtitle">score: ${item.workScore}, действий: ${item.actionsCount}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <h2>7. Проблемные товары</h2>
        ${problemProducts.products.length === 0 ? '<div class="subtitle">Нет проблемных товаров</div>' : ''}
        <div class="list">
          ${problemProducts.products.map((item) => `
            <div class="list-item">
              <div>
                <div class="item-title">${escapeHtml(item.name)}</div>
                <div class="subtitle">${escapeHtml(item.categoryName)} · Арт. ${escapeHtml(item.vendorCode)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `,
  );
  bindCommonButtons();

  document.getElementById('adminSyncBtn').onclick = async () => {
    try {
      const result = await api('/api/catalog/sync-yml', { method: 'POST' });
      await renderAdmin(result.message);
    } catch (errorSync) {
      await renderAdmin(errorSync.message);
    }
  };
  document.getElementById('adminResetSyncBtn').onclick = async () => {
    try {
      const result = await api('/api/admin/sync-reset', { method: 'POST' });
      await renderAdmin(result.message);
    } catch (errorReset) {
      await renderAdmin(errorReset.message);
    }
  };
  document.getElementById('adminClearCacheBtn').onclick = async () => {
    try {
      const result = await api('/api/admin/clear-image-cache', { method: 'POST' });
      await renderAdmin(result.message);
    } catch (errorCache) {
      await renderAdmin(errorCache.message);
    }
  };

  document.getElementById('createUserBtn').onclick = async () => {
    try {
      const result = await api('/api/admin/users', {
        method: 'POST',
        body: {
          login: document.getElementById('newUserLogin').value.trim(),
          password: document.getElementById('newUserPassword').value.trim(),
          role: document.getElementById('newUserRole').value,
        },
      });
      await renderAdmin(result.message);
    } catch (errorUserCreate) {
      await renderAdmin(errorUserCreate.message);
    }
  };

  document.querySelectorAll('[data-user-save]').forEach((el) => {
    el.onclick = async () => {
      const id = Number(el.dataset.userSave);
      try {
        const payload = {
          login: document.getElementById(`user-login-${id}`).value.trim(),
          role: document.getElementById(`user-role-${id}`).value,
        };
        const password = document.getElementById(`user-pass-${id}`).value.trim();
        if (password) payload.password = password;
        const result = await api(`/api/admin/users/${id}`, { method: 'PATCH', body: payload });
        await renderAdmin(result.message);
      } catch (errorSave) {
        await renderAdmin(errorSave.message);
      }
    };
  });

  document.querySelectorAll('[data-user-toggle]').forEach((el) => {
    el.onclick = async () => {
      try {
        const result = await api(`/api/admin/users/${el.dataset.userToggle}/toggle-active`, { method: 'POST' });
        await renderAdmin(result.message);
      } catch (errorToggle) {
        await renderAdmin(errorToggle.message);
      }
    };
  });

  document.querySelectorAll('[data-unlock-lock]').forEach((el) => {
    el.onclick = async () => {
      const [categoryId, pageNumber] = String(el.dataset.unlockLock).split(':').map(Number);
      try {
        const result = await api('/api/admin/unlock-price-page', {
          method: 'POST',
          body: { categoryId, pageNumber },
        });
        await renderAdmin(result.message);
      } catch (errorUnlock) {
        await renderAdmin(errorUnlock.message);
      }
    };
  });

  document.getElementById('pushAllBtn').onclick = async () => {
    try {
      const result = await api('/api/admin/push/send-all', {
        method: 'POST',
        body: {
          title: document.getElementById('pushTitle').value.trim(),
          text: document.getElementById('pushText').value.trim(),
          url: '/',
        },
      });
      await renderAdmin(result.message);
    } catch (errorPushAll) {
      await renderAdmin(errorPushAll.message);
    }
  };

  document.getElementById('pushOneBtn').onclick = async () => {
    const userId = document.getElementById('pushUserId').value.trim();
    if (!userId) return renderAdmin('Укажите ID сотрудника');
    try {
      const result = await api(`/api/admin/push/send-user/${userId}`, {
        method: 'POST',
        body: {
          title: document.getElementById('pushTitle').value.trim(),
          text: document.getElementById('pushText').value.trim(),
          url: '/',
        },
      });
      await renderAdmin(result.message);
    } catch (errorPushOne) {
      await renderAdmin(errorPushOne.message);
    }
  };

  addTimer(setInterval(() => {
    if (window.location.pathname === '/admin') renderAdmin().catch(() => {});
  }, 10000));
}

async function renderRoute() {
  stopTimers();
  const path = window.location.pathname;

  if (path === '/login') {
    renderLogin();
    return;
  }

  if (!state.token) {
    navigate('/login', true);
    return;
  }

  try {
    await ensureMe();
  } catch {
    state.token = '';
    state.me = null;
    localStorage.removeItem('zanToken');
    navigate('/login', true);
    return;
  }

  if (path === '/') {
    await renderHome();
    return;
  }
  if (path === '/carry') {
    await renderCarry();
    return;
  }
  if (path === '/carry/picking') {
    await renderCarryPicking();
    return;
  }
  if (/^\/carry\/\d+$/.test(path)) {
    const categoryId = Number(path.split('/').at(-1));
    await renderCarryCategory(categoryId);
    return;
  }
  if (path === '/price-check') {
    await renderPriceCheckRoot();
    return;
  }
  if (path === '/price-check/report') {
    await renderPriceCheckReport();
    return;
  }
  if (/^\/price-check\/\d+$/.test(path)) {
    const categoryId = Number(path.split('/').at(-1));
    await renderPriceCheckPages(categoryId);
    return;
  }
  if (/^\/price-check\/\d+\/\d+$/.test(path)) {
    const parts = path.split('/');
    const categoryId = Number(parts[2]);
    const pageNumber = Number(parts[3]);
    await renderPriceCheckPage(categoryId, pageNumber);
    return;
  }
  if (path === '/product-check') {
    await renderProductCheck();
    return;
  }
  if (path === '/calendar') {
    await renderCalendar();
    return;
  }
  if (path === '/admin') {
    await renderAdmin();
    return;
  }

  navigate('/', true);
}

window.addEventListener('popstate', () => {
  renderRoute().catch(renderErrorScreen);
});
window.addEventListener('beforeunload', stopTimers);

registerInstallPromptHandlers();
registerServiceWorker();
renderRoute().catch(renderErrorScreen);
