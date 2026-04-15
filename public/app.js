const state = {
  token: localStorage.getItem('warehouseToken') || '',
  appState: null,
  currentCategoryId: null,
  login: 'user',
  password: '7895123',
  pollTimer: null,
  heartbeatTimer: null,
};

const app = document.getElementById('app');

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function stopTimers() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
  state.pollTimer = null;
  state.heartbeatTimer = null;
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'Ошибка запроса');
  }
  return data;
}

function compressedImageUrl(url) {
  if (!url) return '';
  const token = encodeURIComponent(state.token || '');
  return `/api/image?token=${token}&url=${encodeURIComponent(url)}`;
}

function findCategory(categoryId) {
  return state.appState?.categories?.find((item) => Number(item.id) === Number(categoryId));
}

function categoryProducts(categoryId) {
  return state.appState?.productsByCategory?.[categoryId] || state.appState?.productsByCategory?.[String(categoryId)] || [];
}

async function loadState() {
  const data = await api('/api/state');
  state.appState = data.state;
}

function startPolling(renderer) {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    try {
      await loadState();
      renderer();
    } catch {}
  }, 5000);
}

function formatDateTime(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('ru-RU');
  } catch {
    return '—';
  }
}

function syncMeta() {
  return state.appState?.sync || { running: false, progress: 0, stage: '', message: '' };
}

function renderSyncCard() {
  const sync = syncMeta();
  const progress = Number(sync.progress || 0);
  const label = sync.running
    ? `Обновление каталога: ${progress}%`
    : sync.lastFinishedAt
    ? `Каталог обновлён: ${formatDateTime(sync.lastFinishedAt)}`
    : 'Каталог ещё не обновлялся';

  return `
    <div class="glass section-card sync-card">
      <div class="row space-between sync-top-row">
        <div>
          <div class="section-title">Каталог</div>
          <div class="small muted">${escapeHtml(label)}</div>
        </div>
        <button id="syncBtn" class="btn secondary compact" ${sync.running ? 'disabled' : ''}>${sync.running ? 'Обновляется...' : 'Обновить каталог'}</button>
      </div>
      <div class="progress-wrap compact-progress">
        <div class="progress-track"><div class="progress-bar" style="width:${progress}%;"></div></div>
        <div class="small muted" style="margin-top:6px;">${escapeHtml(sync.message || (sync.running ? 'Идёт загрузка и обработка товаров' : 'Готово к обновлению'))}</div>
      </div>
    </div>
  `;
}

function renderLogin(error = '') {
  stopTimers();
  app.innerHTML = `
    <div class="login-wrap shell-bg">
      <div class="glass login-card">
        <div class="app-name">ZAN 1.0</div>
        <h1 class="big-title">Вход</h1>
        <label>Логин
          <input id="loginInput" value="${escapeHtml(state.login)}" />
        </label>
        <label>Пароль
          <input id="passwordInput" type="password" value="${escapeHtml(state.password)}" />
        </label>
        <button id="loginBtn" class="btn full primary-btn" style="margin-top:16px;">Войти</button>
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
      </div>
    </div>
  `;

  document.getElementById('loginBtn').onclick = async () => {
    state.login = document.getElementById('loginInput').value.trim();
    state.password = document.getElementById('passwordInput').value.trim();
    try {
      const data = await api('/api/login', { method: 'POST', body: { login: state.login, password: state.password } });
      state.token = data.token;
      localStorage.setItem('warehouseToken', state.token);
      await loadState();
      renderMenu();
    } catch (error) {
      renderLogin(error.message);
    }
  };
}

function renderMenu(message = '') {
  stopTimers();
  const categories = state.appState?.categories || [];
  const doneCount = categories.filter((item) => item.status === 'completed').length;
  const canOpenPicking = Boolean(state.appState?.canOpenPicking);
  const sync = syncMeta();

  app.innerHTML = `
    <div class="page shell-bg">
      <div class="hero glass">
        <div>
          <div class="app-name">ZAN 1.0</div>
          <h1 class="big-title">Текущая заявка</h1>
          <div class="muted">1 склад · 9 категорий</div>
        </div>
        <div class="status-chip strong-chip">${doneCount} / 9</div>
      </div>

      <div class="top-grid">
        <button id="openRequestBtn" class="btn big primary-btn">Заявка на занос</button>
        <button id="openPickingBtn" class="btn big ${canOpenPicking ? 'green' : 'secondary'}" ${canOpenPicking ? '' : 'disabled'}>Сборка заявки</button>
      </div>

      ${renderSyncCard()}

      <div class="glass section-card">
        <div class="row space-between" style="margin-bottom:10px; align-items:flex-start;">
          <div>
            <div class="section-title">Категории</div>
            <div class="small muted">Статус обновляется каждые 5 секунд</div>
          </div>
          ${sync.running ? `<div class="status-chip">${sync.progress || 0}%</div>` : ''}
        </div>

        <div class="category-list">
          ${categories.map((category) => {
            const cls = category.status === 'completed' ? 'completed' : category.status === 'locked' ? 'locked' : '';
            const statusText = category.status === 'completed'
              ? 'Категория завершена'
              : category.status === 'locked'
              ? 'Сейчас категория занята'
              : 'Готова к заполнению';
            const action = category.status === 'completed'
              ? '<span class="status-done">✓</span>'
              : category.status === 'locked'
              ? `<div class="row" style="gap:8px;"><span class="status-lock">🔒</span><button class="btn secondary compact" data-unlock-category="${category.id}">Разблокировать</button></div>`
              : `<button class="btn compact" data-open-category="${category.id}">Открыть</button>`;

            return `
              <div class="category-item ${cls}">
                <div>
                  <div class="category-name">${escapeHtml(category.name)}</div>
                  <div class="product-sub">${statusText}</div>
                </div>
                <div>${action}</div>
              </div>
            `;
          }).join('')}
        </div>

        ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ''}
      </div>
    </div>
  `;

  document.getElementById('openRequestBtn').onclick = () => renderMenu();
  document.getElementById('openPickingBtn').onclick = () => {
    if (state.appState?.canOpenPicking) renderPicking();
  };
  document.getElementById('syncBtn').onclick = async () => {
    try {
      const data = await api('/api/sync-yml', { method: 'POST' });
      state.appState = data.state;
      renderMenu('Обновление каталога запущено');
    } catch (error) {
      renderMenu(error.message);
    }
  };

  document.querySelectorAll('[data-open-category]').forEach((btn) => {
    btn.onclick = async () => {
      const categoryId = Number(btn.dataset.openCategory);
      try {
        const data = await api(`/api/categories/${categoryId}/lock`, { method: 'POST' });
        state.appState = data.state;
        state.currentCategoryId = categoryId;
        renderCategory(categoryId);
      } catch (error) {
        renderMenu(error.message);
      }
    };
  });

  document.querySelectorAll('[data-unlock-category]').forEach((btn) => {
    btn.onclick = async () => {
      const categoryId = Number(btn.dataset.unlockCategory);
      try {
        const data = await api(`/api/categories/${categoryId}/unlock`, { method: 'POST' });
        state.appState = data.state;
        renderMenu(data.message || 'Категория разблокирована');
      } catch (error) {
        renderMenu(error.message);
      }
    };
  });

  startPolling(() => renderMenu(message));
}

function renderCategory(categoryId, message = '') {
  stopTimers();
  state.currentCategoryId = Number(categoryId);
  const category = findCategory(categoryId);
  const products = categoryProducts(categoryId);
  if (!category) {
    renderMenu('Категория не найдена');
    return;
  }

  app.innerHTML = `
    <div class="sticky-bar">
      <div class="page">
        <div class="row space-between mobile-topline">
          <button id="backBtn" class="btn secondary compact">Назад</button>
          <div style="text-align:right;">
            <div class="section-title" style="margin:0;">${escapeHtml(category.name)}</div>
            <div id="scrollText" class="small muted">До конца категории осталось 100%</div>
          </div>
        </div>
        <div class="progress-wrap compact-progress">
          <div class="progress-track"><div id="scrollBar" class="progress-bar"></div></div>
        </div>
      </div>
    </div>

    <div class="page shell-bg">
      <div class="glass section-card slim-pad">
        <div class="row space-between" style="flex-wrap:wrap; gap:10px;">
          <div class="row" style="flex-wrap:wrap;">
            <div class="status-chip">Фото: +1</div>
            <div class="status-chip">Круг: −1</div>
          </div>
          <div class="row" style="flex-wrap:wrap; gap:8px;">
            <button id="unlockBtn" class="btn secondary compact">Разблокировать</button>
            <button id="completeBtn" class="btn green compact">Конец заявки</button>
          </div>
        </div>
        ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ''}
      </div>

      <div class="products-grid mobile-grid">
        ${products.map((product) => {
          const ordered = Number(product.qty) > 0;
          const src = compressedImageUrl(product.picture || '');
          return `
            <div class="product-card glass-card">
              <div class="product-image-wrap" data-add-id="${product.id}">
                ${src ? `<img loading="lazy" src="${escapeHtml(src)}" alt="${escapeHtml(product.name)}" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend','<div class=&quot;image-placeholder&quot;>Нет фото</div>')" />` : '<div class="image-placeholder">Нет фото</div>'}
                ${ordered ? '<div class="product-overlay"></div>' : ''}
                ${ordered ? `<button class="qty-badge" data-sub-id="${product.id}">${product.qty}</button>` : ''}
              </div>
              <div class="product-body">
                <div class="product-title">${escapeHtml(product.name)}</div>
                <div class="product-sub">Арт. ${escapeHtml(product.vendor_code)}</div>
                ${product.stock_quantity !== null ? `<div class="product-sub">Остаток: ${escapeHtml(product.stock_quantity)}</div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  document.getElementById('backBtn').onclick = () => renderMenu();
  document.getElementById('unlockBtn').onclick = async () => {
    try {
      const data = await api(`/api/categories/${categoryId}/unlock`, { method: 'POST' });
      state.appState = data.state;
      renderMenu(data.message || 'Категория разблокирована');
    } catch (error) {
      renderCategory(categoryId, error.message);
    }
  };
  document.getElementById('completeBtn').onclick = async () => {
    try {
      const data = await api(`/api/categories/${categoryId}/complete`, { method: 'POST' });
      state.appState = data.state;
      renderMenu('Категория завершена');
    } catch (error) {
      renderCategory(categoryId, error.message);
    }
  };

  document.querySelectorAll('[data-add-id]').forEach((el) => {
    el.onclick = async () => {
      try {
        const data = await api(`/api/items/${el.dataset.addId}/increment`, { method: 'POST' });
        state.appState = data.state;
        renderCategory(categoryId);
      } catch (error) {
        renderCategory(categoryId, error.message);
      }
    };
  });

  document.querySelectorAll('[data-sub-id]').forEach((el) => {
    el.onclick = async (event) => {
      event.stopPropagation();
      try {
        const data = await api(`/api/items/${el.dataset.subId}/decrement`, { method: 'POST' });
        state.appState = data.state;
        renderCategory(categoryId);
      } catch (error) {
        renderCategory(categoryId, error.message);
      }
    };
  });

  state.heartbeatTimer = setInterval(() => {
    api(`/api/categories/${categoryId}/heartbeat`, { method: 'POST' }).catch(() => {});
  }, 20000);

  state.pollTimer = setInterval(async () => {
    try {
      await loadState();
    } catch {}
  }, 5000);

  const syncProgress = () => {
    const scrollTop = window.scrollY;
    const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
    const percent = documentHeight <= 0 ? 0 : Math.min(100, Math.round((scrollTop / documentHeight) * 100));
    const remaining = Math.max(0, 100 - percent);
    const bar = document.getElementById('scrollBar');
    const text = document.getElementById('scrollText');
    if (bar) bar.style.width = `${percent}%`;
    if (text) text.textContent = `До конца категории осталось ${remaining}%`;
  };

  syncProgress();
  window.onscroll = syncProgress;
}

function buildPrintHtml(sections) {
  const now = new Date();
  const dateTime = now.toLocaleString('ru-RU');
  const body = sections.map((section) => `
    <div class="print-category-block">
      <div class="print-category-name">${escapeHtml(section.category.name)}</div>
      <table class="print-table">
        <thead>
          <tr>
            <th>Название товара</th>
            <th>Количество</th>
          </tr>
        </thead>
        <tbody>
          ${section.products.map((product) => `
            <tr>
              <td>${escapeHtml(product.name)}</td>
              <td>${escapeHtml(product.qty)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  return `
    <!doctype html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8" />
      <title>Печатная форма сборки</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
        .title { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
        .meta { font-size: 14px; color: #444; margin-bottom: 18px; }
        .print-category-name { font-size: 18px; font-weight: 700; margin: 18px 0 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        th, td { border: 1px solid #cfcfcf; padding: 8px 10px; text-align: left; }
        th:last-child, td:last-child { width: 120px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="title">Печатная форма сборки</div>
      <div class="meta">Дата и время: ${escapeHtml(dateTime)}</div>
      ${body}
    </body>
    </html>
  `;
}

function openPrintWindow(sections) {
  const html = buildPrintHtml(sections);
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

function renderPicking(message = '') {
  stopTimers();
  const categories = state.appState?.categories || [];
  const sections = categories.map((category) => ({
    category,
    products: categoryProducts(category.id).filter((item) => Number(item.qty) > 0)
  })).filter((section) => section.products.length > 0);

  const flat = sections.flatMap((section) => section.products);
  const total = flat.length;
  const done = flat.filter((item) => Number(item.picked) === 1).length;
  const allPicked = total > 0 && done === total;

  app.innerHTML = `
    <div class="page shell-bg">
      <div class="hero glass compact-hero">
        <button id="backBtn" class="btn secondary compact">Назад</button>
        <div style="text-align:right;">
          <h1 class="big-title">Сборка заявки</h1>
          <div class="muted">Собрано ${done} из ${total}</div>
        </div>
      </div>

      <div class="row" style="gap:10px; flex-wrap:wrap; margin:14px 0;">
        <button id="printBtn" class="btn secondary compact">Печать формы</button>
        <button id="completeAllBtn" class="btn green compact">Заявка собрана полностью</button>
      </div>

      ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ''}

      ${sections.map((section) => `
        <div class="glass section-card" style="margin-top:16px;">
          <div class="section-title">${escapeHtml(section.category.name)}</div>
          <div class="products-grid mobile-grid">
            ${section.products.map((product) => {
              const src = compressedImageUrl(product.picture || '');
              return `
                <div class="product-card glass-card">
                  <div class="product-image-wrap" data-pick-id="${product.id}">
                    ${src ? `<img loading="lazy" src="${escapeHtml(src)}" alt="${escapeHtml(product.name)}" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend','<div class=&quot;image-placeholder&quot;>Нет фото</div>')" />` : '<div class="image-placeholder">Нет фото</div>'}
                    <div class="qty-badge">${product.qty}</div>
                    ${Number(product.picked) === 1 ? '<div class="picked-mark">✓</div>' : ''}
                  </div>
                  <div class="product-body">
                    <div class="product-title">${escapeHtml(product.name)}</div>
                    <div class="product-sub">Арт. ${escapeHtml(product.vendor_code)}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}

      <div class="footer-bar glass row end-row">
        <button id="resetBtn" class="btn ${allPicked ? 'green' : 'secondary'}" ${allPicked ? '' : 'disabled'}>Заказ собран</button>
      </div>
    </div>
  `;

  document.getElementById('backBtn').onclick = () => renderMenu();
  document.getElementById('printBtn').onclick = () => openPrintWindow(sections);
  document.getElementById('completeAllBtn').onclick = async () => {
    try {
      const data = await api('/api/order/complete-all', { method: 'POST' });
      state.appState = data.state;
      renderMenu(data.message || 'Заявка полностью собрана');
    } catch (error) {
      renderPicking(error.message);
    }
  };

  document.querySelectorAll('[data-pick-id]').forEach((el) => {
    el.onclick = async () => {
      try {
        const data = await api(`/api/items/${el.dataset.pickId}/toggle-picked`, { method: 'POST' });
        state.appState = data.state;
        renderPicking();
      } catch (error) {
        renderPicking(error.message);
      }
    };
  });

  document.getElementById('resetBtn').onclick = async () => {
    try {
      const data = await api('/api/order/reset', { method: 'POST' });
      state.appState = data.state;
      renderMenu('Заказ завершён и полностью очищен');
    } catch (error) {
      renderPicking(error.message);
    }
  };

  startPolling(() => renderPicking(message));
}

async function boot() {
  if (!state.token) {
    renderLogin();
    return;
  }

  try {
    await loadState();
    renderMenu();
  } catch {
    localStorage.removeItem('warehouseToken');
    state.token = '';
    renderLogin();
  }
}

window.addEventListener('beforeunload', stopTimers);
boot();
