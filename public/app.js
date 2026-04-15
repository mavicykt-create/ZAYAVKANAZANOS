const state = {
  token: localStorage.getItem('warehouseToken') || '',
  appState: null,
  currentCategoryId: null,
  login: 'user',
  password: '7895123',
  pollTimer: null,
  heartbeatTimer: null
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
    body: options.body ? JSON.stringify(options.body) : undefined
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

function renderLogin(error = '') {
  stopTimers();
  app.innerHTML = `
    <div class="login-wrap shell-bg">
      <div class="glass login-card">
        <div class="brand-pill">Склад · Занос</div>
        <h1 class="big-title">Вход сотрудников</h1>
        <div class="muted">Общий сервис для заявки и сборки</div>
        <label>Логин
          <input id="loginInput" value="${escapeHtml(state.login)}" />
        </label>
        <label>Пароль
          <input id="passwordInput" type="password" value="${escapeHtml(state.password)}" />
        </label>
        <button id="loginBtn" class="btn full primary-btn" style="margin-top:16px;">Войти</button>
        <div class="notice small">Логин и пароль в боевой версии лучше держать в переменных окружения Amvera.</div>
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

  app.innerHTML = `
    <div class="page shell-bg">
      <div class="hero glass">
        <div>
          <div class="brand-pill">Apple‑style mobile UI</div>
          <h1 class="big-title">Текущая заявка</h1>
          <div class="muted">1 склад · 9 категорий · общая работа сотрудников</div>
        </div>
        <div class="status-chip strong-chip">${doneCount} / 9 категорий</div>
      </div>

      <div class="top-grid">
        <button id="openRequestBtn" class="btn big primary-btn">Заявка на занос</button>
        <button id="openPickingBtn" class="btn big ${canOpenPicking ? 'green' : 'secondary'}" ${canOpenPicking ? '' : 'disabled'}>Сборка заявки</button>
      </div>

      <div class="glass section-card">
        <div class="row space-between" style="margin-bottom:10px; align-items:flex-start;">
          <div>
            <div class="section-title">Категории</div>
            <div class="small muted">Замки и статусы обновляются автоматически</div>
          </div>
          <div class="row" style="flex-wrap:wrap; justify-content:flex-end;">
            <button id="syncBtn" class="btn secondary">Обновить каталог из YML</button>
          </div>
        </div>

        <div class="category-list">
          ${categories.map((category) => {
            const cls = category.status === 'completed' ? 'completed' : category.status === 'locked' ? 'locked' : '';
            const statusText = category.status === 'completed'
              ? 'Категория завершена'
              : category.status === 'locked'
              ? 'Сейчас занята или зависла'
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
      renderMenu('Каталог успешно обновлён из YML');
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
            <div class="small muted">Фото сжимаются сервером для быстрой загрузки</div>
          </div>
        </div>
        <div class="progress-wrap">
          <div class="progress-track"><div id="scrollBar" class="progress-bar"></div></div>
          <div id="scrollText" class="small muted" style="margin-top:6px;">До конца категории осталось 100%</div>
        </div>
      </div>
    </div>

    <div class="page shell-bg">
      <div class="glass section-card slim-pad">
        <div class="row space-between" style="flex-wrap:wrap; gap:10px;">
          <div class="row" style="flex-wrap:wrap;">
            <div class="status-chip">Мобильная сетка</div>
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
                ${src ? `<img loading="lazy" src="${escapeHtml(src)}" alt="${escapeHtml(product.name)}" onerror="this.style.display='none'" />` : '<div class="image-placeholder">Нет фото</div>'}
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

function renderPrintTable(lines) {
  if (!lines.length) {
    return `<div class="notice">В заявке пока нет заказанных товаров.</div>`;
  }

  return `
    <div class="print-sheet">
      <div class="print-header">
        <div class="print-title">Печатная форма сборки</div>
        <div class="small muted">Категория · Название товара · Количество</div>
      </div>
      <table class="print-table">
        <thead>
          <tr>
            <th>Категория</th>
            <th>Название товара</th>
            <th>Количество</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map((line) => `
            <tr>
              <td>${escapeHtml(line.category)}</td>
              <td>${escapeHtml(line.name)}</td>
              <td>${escapeHtml(line.qty)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
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
  const printLines = sections.flatMap((section) => section.products.map((product) => ({
    category: section.category.name,
    name: product.name,
    qty: product.qty
  })));

  app.innerHTML = `
    <div class="page shell-bg">
      <div class="hero glass compact-hero">
        <button id="backBtn" class="btn secondary compact">Назад</button>
        <div style="text-align:right;">
          <h1 class="big-title">Сборка заявки</h1>
          <div class="muted">Собрано ${done} из ${total} заказанных товаров</div>
        </div>
      </div>

      <div class="row" style="gap:10px; flex-wrap:wrap; margin:14px 0;">
        <button id="printBtn" class="btn secondary compact">Печать формы</button>
        <button id="completeAllBtn" class="btn green compact">Заявка собрана полностью</button>
      </div>

      ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ''}

      <div id="printBlock">${renderPrintTable(printLines)}</div>

      ${sections.map((section) => `
        <div class="glass section-card" style="margin-top:16px;">
          <div class="section-title">${escapeHtml(section.category.name)}</div>
          <div class="products-grid mobile-grid">
            ${section.products.map((product) => {
              const src = compressedImageUrl(product.picture || '');
              return `
                <div class="product-card glass-card">
                  <div class="product-image-wrap" data-pick-id="${product.id}">
                    ${src ? `<img loading="lazy" src="${escapeHtml(src)}" alt="${escapeHtml(product.name)}" onerror="this.style.display='none'" />` : '<div class="image-placeholder">Нет фото</div>'}
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

      <div class="footer-bar glass row space-between">
        <div>
          <div style="font-weight:700;">Финализация текущего заказа</div>
          <div class="muted small">Можно либо отмечать позиции, либо закрыть весь заказ одной кнопкой</div>
        </div>
        <button id="resetBtn" class="btn ${allPicked ? 'green' : 'secondary'}" ${allPicked ? '' : 'disabled'}>Заказ собран</button>
      </div>
    </div>
  `;

  document.getElementById('backBtn').onclick = () => renderMenu();
  document.getElementById('printBtn').onclick = () => window.print();
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
