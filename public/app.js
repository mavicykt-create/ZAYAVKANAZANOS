const state = {
  token: localStorage.getItem('warehouseToken') || '',
  appState: null,
  currentCategoryId: null,
  login: 'user',
  password: '7895123'
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

function renderLogin(error = '') {
  app.innerHTML = `
    <div class="login-wrap">
      <div class="card login-card">
        <h1 class="big-title">Заказ на занос</h1>
        <div class="muted">Вход для сотрудников</div>
        <label>Логин
          <input id="loginInput" value="${escapeHtml(state.login)}" />
        </label>
        <label>Пароль
          <input id="passwordInput" type="password" value="${escapeHtml(state.password)}" />
        </label>
        <button id="loginBtn" class="btn full" style="margin-top:16px;">Войти</button>
        <div class="notice small">В боевой версии логин и пароль лучше хранить в переменных окружения Amvera.</div>
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
      </div>
    </div>
  `;

  document.getElementById('loginBtn').onclick = async () => {
    state.login = document.getElementById('loginInput').value.trim();
    state.password = document.getElementById('passwordInput').value.trim();
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: { login: state.login, password: state.password }
      });
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
  const categories = state.appState?.categories || [];
  const doneCount = categories.filter((item) => item.status === 'completed').length;
  const canOpenPicking = Boolean(state.appState?.canOpenPicking);

  app.innerHTML = `
    <div class="page">
      <div class="row space-between">
        <div>
          <h1 class="big-title">Текущая заявка</h1>
          <div class="muted">1 склад · 9 категорий · общая работа сотрудников</div>
        </div>
        <div class="status-chip">${doneCount} / 9 категорий</div>
      </div>

      <div class="top-grid">
        <button id="openRequestBtn" class="btn big">Заявка на занос</button>
        <button id="openPickingBtn" class="btn big ${canOpenPicking ? '' : 'secondary'}" ${canOpenPicking ? '' : 'disabled'}>Сборка заявки</button>
      </div>

      <div class="card" style="padding:16px;">
        <div class="row space-between" style="margin-bottom:10px;">
          <div class="section-title">Категории</div>
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
              ? 'Сейчас занята другим сотрудником'
              : 'Готова к заполнению';
            const action = category.status === 'completed'
              ? '<span style="font-size:24px;color:#16a34a;">✓</span>'
              : category.status === 'locked'
              ? '<span style="font-size:20px;color:#d97706;">🔒</span>'
              : `<button class="btn" data-open-category="${category.id}">Открыть</button>`;

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
}

function renderCategory(categoryId, message = '') {
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
        <div class="row space-between">
          <button id="backBtn" class="btn secondary">Назад</button>
          <div style="text-align:right;">
            <div class="section-title" style="margin:0;">${escapeHtml(category.name)}</div>
            <div class="small muted">Остаток пути по категории считается по прокрутке</div>
          </div>
        </div>
        <div class="progress-wrap">
          <div class="progress-track"><div id="scrollBar" class="progress-bar"></div></div>
          <div id="scrollText" class="small muted" style="margin-top:6px;">До конца категории осталось 100%</div>
        </div>
      </div>
    </div>

    <div class="page">
      <div class="row space-between" style="flex-wrap:wrap; gap:10px;">
        <div class="row" style="flex-wrap:wrap;">
          <div class="status-chip">4 товара в ряд на широком экране</div>
          <div class="status-chip">Нажатие на фото: +1</div>
          <div class="status-chip">Нажатие на круг: -1</div>
        </div>
        <button id="completeBtn" class="btn green">Конец заявки</button>
      </div>

      ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ''}

      <div class="products-grid">
        ${products.map((product) => {
          const ordered = Number(product.qty) > 0;
          return `
            <div class="product-card">
              <div class="product-image-wrap" data-add-id="${product.id}">
                <img src="${escapeHtml(product.picture || '')}" alt="${escapeHtml(product.name)}" onerror="this.style.display='none'" />
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

  const heartbeat = setInterval(() => {
    api(`/api/categories/${categoryId}/heartbeat`, { method: 'POST' }).catch(() => {});
  }, 20000);

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
  window.onbeforeunload = () => clearInterval(heartbeat);
}

function renderPicking(message = '') {
  const categories = state.appState?.categories || [];
  const sections = categories.map((category) => ({
    category,
    products: categoryProducts(category.id).filter((item) => Number(item.qty) > 0)
  })).filter((section) => section.products.length > 0);

  const total = sections.flatMap((section) => section.products).length;
  const done = sections.flatMap((section) => section.products).filter((item) => Number(item.picked) === 1).length;
  const allPicked = total > 0 && done === total;

  app.innerHTML = `
    <div class="page">
      <div class="row space-between" style="gap:12px; flex-wrap:wrap;">
        <button id="backBtn" class="btn secondary">Назад</button>
        <div style="text-align:right;">
          <h1 class="big-title">Сборка заявки</h1>
          <div class="muted">Собрано ${done} из ${total} заказанных товаров</div>
        </div>
      </div>

      ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ''}

      ${sections.map((section) => `
        <div class="card" style="padding:16px; margin-top:16px;">
          <div class="section-title">${escapeHtml(section.category.name)}</div>
          <div class="products-grid">
            ${section.products.map((product) => `
              <div class="product-card">
                <div class="product-image-wrap" data-pick-id="${product.id}">
                  <img src="${escapeHtml(product.picture || '')}" alt="${escapeHtml(product.name)}" onerror="this.style.display='none'" />
                  <div class="qty-badge">${product.qty}</div>
                  ${Number(product.picked) === 1 ? '<div class="picked-mark">✓</div>' : ''}
                </div>
                <div class="product-body">
                  <div class="product-title">${escapeHtml(product.name)}</div>
                  <div class="product-sub">Арт. ${escapeHtml(product.vendor_code)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}

      <div class="footer-bar card row space-between">
        <div>
          <div style="font-weight:700;">Финализация текущего заказа</div>
          <div class="muted small">После завершения всё очистится до следующего цикла</div>
        </div>
        <button id="resetBtn" class="btn green" ${allPicked ? '' : 'disabled'}>Заказ собран</button>
      </div>
    </div>
  `;

  document.getElementById('backBtn').onclick = () => renderMenu();
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

boot();
