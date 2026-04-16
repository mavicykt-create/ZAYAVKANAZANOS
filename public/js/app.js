/**
 * ZAN 1.1 - Modern Application JavaScript
 * Enhanced with smooth animations and glassmorphism effects
 * Original functionality preserved
 */

// ============================================
// State Management
// ============================================
const state = {
    currentUser: null,
    currentScreen: 'login',
    products: [],
    categories: [],
    cart: {},
    currentCategory: null,
    priceCheck: {
        pages: [],
        currentPage: null,
        products: [],
        locks: []
    },
    productCheck: {
        products: [],
        hidden: new Set()
    },
    calendar: {
        currentWeek: new Date(),
        events: []
    },
    admin: {
        users: [],
        stats: {},
        syncStatus: null
    },
    assembly: [],
    installPrompt: null,
    deferredInstallPrompt: null
};

// ============================================
// Utility Functions
// ============================================
const utils = {
    formatDate: (date) => {
        return new Date(date).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    },

    formatDateTime: (date) => {
        return new Date(date).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    escapeHtml: (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    showToast: (message, type = 'info') => {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
                <span class="toast-message">${message}</span>
            </div>
        `;
        document.body.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        // Remove after delay
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    animateElement: (element, animation, duration = 300) => {
        element.style.animation = 'none';
        requestAnimationFrame(() => {
            element.style.animation = `${animation} ${duration}ms ease-out`;
        });
    },

    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// ============================================
// API Functions
// ============================================
const api = {
    request: async (endpoint, options = {}) => {
        try {
            const response = await fetch(endpoint, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            utils.showToast('Ошибка соединения', 'error');
            throw error;
        }
    },

    login: (login, password) => api.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login, password })
    }),

    logout: () => api.request('/api/auth/logout', { method: 'POST' }),

    getCategories: () => api.request('/api/catalog/categories'),

    getProducts: (categoryId) => api.request(`/api/catalog/products?category=${categoryId}`),

    getAssembly: () => api.request('/api/carry/assembly'),

    addToAssembly: (productId, quantity) => api.request('/api/carry/assembly', {
        method: 'POST',
        body: JSON.stringify({ productId, quantity })
    }),

    updateAssemblyItem: (itemId, completed) => api.request(`/api/carry/assembly/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ completed })
    }),

    clearAssembly: () => api.request('/api/carry/assembly', { method: 'DELETE' }),

    getPriceCheckPages: () => api.request('/api/price-check/pages'),

    lockPriceCheckPage: (page) => api.request('/api/price-check/lock', {
        method: 'POST',
        body: JSON.stringify({ page })
    }),

    unlockPriceCheckPage: (page) => api.request('/api/price-check/unlock', {
        method: 'POST',
        body: JSON.stringify({ page })
    }),

    getPriceCheckProducts: (page) => api.request(`/api/price-check/products?page=${page}`),

    markPriceCheckProduct: (productId, type) => api.request('/api/price-check/mark', {
        method: 'POST',
        body: JSON.stringify({ productId, type })
    }),

    getProductCheckProducts: () => api.request('/api/product-check/products'),

    hideProductCheckProduct: (productId) => api.request(`/api/product-check/hide/${productId}`, {
        method: 'POST'
    }),

    getCalendarEvents: (week) => api.request(`/api/calendar/events?week=${week.toISOString()}`),

    createCalendarEvent: (event) => api.request('/api/calendar/events', {
        method: 'POST',
        body: JSON.stringify(event)
    }),

    deleteCalendarEvent: (eventId) => api.request(`/api/calendar/events/${eventId}`, {
        method: 'DELETE'
    }),

    getAdminStats: () => api.request('/api/admin/stats'),

    getAdminUsers: () => api.request('/api/admin/users'),

    createUser: (user) => api.request('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(user)
    }),

    updateUser: (userId, user) => api.request(`/api/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(user)
    }),

    deleteUser: (userId) => api.request(`/api/admin/users/${userId}`, {
        method: 'DELETE'
    }),

    syncCatalog: () => api.request('/api/sync/start', { method: 'POST' }),

    getSyncStatus: () => api.request('/api/sync/status'),

    getLocks: () => api.request('/api/admin/locks'),

    forceUnlock: (category, page) => api.request('/api/admin/force-unlock', {
        method: 'POST',
        body: JSON.stringify({ category, page })
    })
};

// ============================================
// Screen Renderers
// ============================================
const screens = {
    // Login Screen
    login: () => {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="login-screen">
                <div class="login-logo">ZAN</div>
                <div class="login-subtitle">Система управления складом</div>
                <form class="login-form" id="loginForm">
                    <input type="text" class="login-input" id="loginInput" placeholder="Логин" required autocomplete="username">
                    <input type="password" class="login-input" id="passwordInput" placeholder="Пароль" required autocomplete="current-password">
                    <button type="submit" class="login-btn">Войти</button>
                </form>
            </div>
        `;

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const login = document.getElementById('loginInput').value;
            const password = document.getElementById('passwordInput').value;

            try {
                const result = await api.login(login, password);
                if (result.success) {
                    state.currentUser = result.user;
                    utils.showToast('Добро пожаловать!', 'success');
                    screens.menu();
                } else {
                    utils.showToast(result.error || 'Ошибка входа', 'error');
                }
            } catch (error) {
                console.error('Login error:', error);
            }
        });
    },

    // Main Menu
    menu: () => {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="header">
                <div class="header-title">ZAN 1.1</div>
                <button class="logout-btn" id="logoutBtn">Выйти</button>
            </div>
            <div class="menu-grid">
                <div class="menu-item" data-screen="carry">
                    <span class="menu-icon">📦</span>
                    <span class="menu-label">Заявка на занос</span>
                </div>
                <div class="menu-item" data-screen="price-check">
                    <span class="menu-icon">🏷️</span>
                    <span class="menu-label">Проверка ценников</span>
                </div>
                <div class="menu-item" data-screen="product-check">
                    <span class="menu-icon">🔍</span>
                    <span class="menu-label">Проверка товара</span>
                </div>
                <div class="menu-item" data-screen="calendar">
                    <span class="menu-icon">📅</span>
                    <span class="menu-label">Календарь</span>
                </div>
                ${state.currentUser?.role === 'admin' ? `
                <div class="menu-item" data-screen="admin">
                    <span class="menu-icon">⚙️</span>
                    <span class="menu-label">Админка</span>
                </div>
                ` : ''}
            </div>
        `;

        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const screen = item.dataset.screen;
                if (screens[screen]) {
                    screens[screen]();
                }
            });
        });

        document.getElementById('logoutBtn').addEventListener('click', async () => {
            try {
                await api.logout();
                state.currentUser = null;
                screens.login();
            } catch (error) {
                console.error('Logout error:', error);
            }
        });
    },

    // Carry (Заявка на занос)
    carry: async () => {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="header">
                <button class="back-btn" id="backBtn">← Назад</button>
                <div class="header-title">Заявка на занос</div>
                <div></div>
            </div>
            <div id="carryContent">
                <div class="loading">Загрузка...</div>
            </div>
        `;

        document.getElementById('backBtn').addEventListener('click', () => screens.menu());

        try {
            const categories = await api.getCategories();
            state.categories = categories;
            renderCategoryList(categories);
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    },

    // Price Check
    'price-check': async () => {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="header">
                <button class="back-btn" id="backBtn">← Назад</button>
                <div class="header-title">Проверка ценников</div>
                <div></div>
            </div>
            <div id="priceCheckContent">
                <div class="loading">Загрузка...</div>
            </div>
        `;

        document.getElementById('backBtn').addEventListener('click', () => screens.menu());

        try {
            const data = await api.getPriceCheckPages();
            state.priceCheck.pages = data.pages;
            state.priceCheck.locks = data.locks || [];
            renderPriceCheckPages(data.pages);
        } catch (error) {
            console.error('Error loading price check:', error);
        }
    },

    // Product Check
    'product-check': async () => {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="header">
                <button class="back-btn" id="backBtn">← Назад</button>
                <div class="header-title">Проверка товара</div>
                <div></div>
            </div>
            <div id="productCheckContent">
                <div class="loading">Загрузка...</div>
            </div>
        `;

        document.getElementById('backBtn').addEventListener('click', () => screens.menu());

        try {
            const products = await api.getProductCheckProducts();
            state.productCheck.products = products;
            renderProductCheck(products);
        } catch (error) {
            console.error('Error loading product check:', error);
        }
    },

    // Calendar
    calendar: async () => {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="header">
                <button class="back-btn" id="backBtn">← Назад</button>
                <div class="header-title">Календарь</div>
                <div></div>
            </div>
            <div id="calendarContent">
                <div class="loading">Загрузка...</div>
            </div>
        `;

        document.getElementById('backBtn').addEventListener('click', () => screens.menu());

        try {
            const events = await api.getCalendarEvents(state.calendar.currentWeek);
            state.calendar.events = events;
            renderCalendar(events);
        } catch (error) {
            console.error('Error loading calendar:', error);
        }
    },

    // Admin
    admin: async () => {
        if (state.currentUser?.role !== 'admin') {
            utils.showToast('Доступ запрещен', 'error');
            return screens.menu();
        }

        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="header">
                <button class="back-btn" id="backBtn">← Назад</button>
                <div class="header-title">Администрирование</div>
                <div></div>
            </div>
            <div class="admin-tabs">
                <div class="admin-tab active" data-tab="overview">Обзор</div>
                <div class="admin-tab" data-tab="users">Пользователи</div>
                <div class="admin-tab" data-tab="locks">Блокировки</div>
                <div class="admin-tab" data-tab="sync">Синхронизация</div>
            </div>
            <div id="adminContent">
                <div class="loading">Загрузка...</div>
            </div>
        `;

        document.getElementById('backBtn').addEventListener('click', () => screens.menu());

        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                loadAdminTab(tab.dataset.tab);
            });
        });

        loadAdminTab('overview');
    }
};

// ============================================
// Helper Render Functions
// ============================================
function renderCategoryList(categories) {
    const content = document.getElementById('carryContent');
    if (!categories || categories.length === 0) {
        content.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>Нет доступных категорий</p></div>';
        return;
    }

    content.innerHTML = `
        <div class="categories-list">
            ${categories.map(cat => `
                <div class="category-item" data-id="${cat.id}">
                    <span class="category-name">${utils.escapeHtml(cat.name)}</span>
                    <span class="category-arrow">›</span>
                </div>
            `).join('')}
        </div>
    `;

    document.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('click', async () => {
            const categoryId = item.dataset.id;
            const category = categories.find(c => c.id == categoryId);
            state.currentCategory = category;
            await loadProducts(categoryId);
        });
    });
}

async function loadProducts(categoryId) {
    const content = document.getElementById('carryContent');
    content.innerHTML = '<div class="loading">Загрузка товаров...</div>';

    try {
        const products = await api.getProducts(categoryId);
        state.products = products;
        renderProducts(products);
    } catch (error) {
        content.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Ошибка загрузки товаров</p></div>';
    }
}

function renderProducts(products) {
    const content = document.getElementById('carryContent');
    if (!products || products.length === 0) {
        content.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>Нет товаров в категории</p></div>';
        return;
    }

    content.innerHTML = `
        <div class="products-grid" id="productsGrid">
            ${products.map((product, index) => {
                const qty = state.cart[product.id] || 0;
                const hasStep5 = product.name.includes('1/');
                return `
                    <div class="product-card" data-id="${product.id}" data-step5="${hasStep5}" style="animation: fadeInUp ${index * 0.05}s ease-out">
                        <div class="qty-control" data-id="${product.id}"></div>
                        <img src="${product.image || '/data/image-cache-v5/no-image.webp'}" 
                             class="product-image" 
                             alt="${utils.escapeHtml(product.name)}"
                             loading="lazy">
                        <div class="product-info">
                            <div class="product-name">${utils.escapeHtml(product.name)}</div>
                        </div>
                        ${qty > 0 ? `<div class="product-qty" data-qty="${qty}"></div>` : ''}
                    </div>
                `;
            }).join('')}
        </div>
        <div class="bottom-actions">
            <button class="btn btn-secondary" id="backToCategories">← Категории</button>
            <button class="btn btn-primary" id="viewAssembly">Корзина (${Object.values(state.cart).reduce((a, b) => a + b, 0)})</button>
        </div>
    `;

    // Add animations with GPU acceleration
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px) translateZ(0); }
            to { opacity: 1; transform: translateY(0) translateZ(0); }
        }
        .product-card {
            /* Prevent flicker during animations */
            -webkit-transform: translateZ(0);
            transform: translateZ(0);
            will-change: transform;
        }
    `;
    document.head.appendChild(style);

    // Product card clicks - FIXED: prevent flicker
    document.querySelectorAll('.product-card').forEach(card => {
        // Use pointerdown for faster response on mobile
        card.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.qty-control')) return;

            // Visual feedback without layout shift
            card.style.transform = 'scale(0.95)';
        });

        card.addEventListener('pointerup', (e) => {
            if (e.target.closest('.qty-control')) return;

            const productId = card.dataset.id;
            const hasStep5 = card.dataset.step5 === 'true';
            const step = hasStep5 ? 5 : 1;

            state.cart[productId] = (state.cart[productId] || 0) + step;
            updateProductCard(productId);
            updateAssemblyButton();

            // Restore with animation
            requestAnimationFrame(() => {
                card.style.transform = '';
            });
        });

        // Cancel if pointer leaves
        card.addEventListener('pointerleave', () => {
            card.style.transform = '';
        });
    });

    // Quantity control (decrease)
    document.querySelectorAll('.qty-control').forEach(ctrl => {
        ctrl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const productId = ctrl.dataset.id;
            const hasStep5 = document.querySelector(`.product-card[data-id="${productId}"]`).dataset.step5 === 'true';
            const step = hasStep5 ? 5 : 1;

            if (state.cart[productId]) {
                state.cart[productId] = Math.max(0, state.cart[productId] - step);
                if (state.cart[productId] === 0) delete state.cart[productId];
                updateProductCard(productId);
                updateAssemblyButton();
            }
        });
    });

    document.getElementById('backToCategories').addEventListener('click', () => {
        renderCategoryList(state.categories);
    });

    document.getElementById('viewAssembly').addEventListener('click', () => {
        renderAssembly();
    });
}

function updateProductCard(productId) {
    const card = document.querySelector(`.product-card[data-id="${productId}"]`);
    if (!card) return;

    const qty = state.cart[productId] || 0;
    let badge = card.querySelector('.product-qty');

    if (qty > 0) {
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'product-qty';
            card.appendChild(badge);
        }
        badge.setAttribute('data-qty', qty);
        badge.style.animation = 'none';
        requestAnimationFrame(() => {
            badge.style.animation = 'pulse 0.3s ease-out';
        });
    } else if (badge) {
        badge.remove();
    }
}

function updateAssemblyButton() {
    const btn = document.getElementById('viewAssembly');
    if (btn) {
        const total = Object.values(state.cart).reduce((a, b) => a + b, 0);
        btn.textContent = `Корзина (${total})`;
    }
}

function renderAssembly() {
    const content = document.getElementById('carryContent');
    const items = Object.entries(state.cart).map(([productId, qty]) => {
        const product = state.products.find(p => p.id == productId);
        return { ...product, quantity: qty };
    }).filter(item => item.id);

    if (items.length === 0) {
        content.innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div><p>Корзина пуста</p></div>';
        return;
    }

    content.innerHTML = `
        <div id="assemblyList">
            ${items.map((item, index) => `
                <div class="assembly-item" data-id="${item.id}" style="animation: slideIn ${index * 0.05}s ease-out">
                    <div class="assembly-checkbox" data-id="${item.id}"></div>
                    <div class="assembly-content">
                        <div>${utils.escapeHtml(item.name)}</div>
                        <div style="font-size: 13px; color: var(--text-tertiary);">${item.vendor_code || ''}</div>
                    </div>
                    <div class="assembly-qty">×${item.quantity}</div>
                </div>
            `).join('')}
        </div>
        <div class="bottom-actions">
            <button class="btn btn-secondary" id="backToProducts">← Назад</button>
            <button class="btn btn-danger" id="clearAssembly">Очистить</button>
            <button class="btn btn-primary" id="printAssembly">🖨️ Печать</button>
        </div>
    `;

    // Add slide animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { opacity: 0; transform: translateX(-20px); }
            to { opacity: 1; transform: translateX(0); }
        }
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }
    `;
    document.head.appendChild(style);

    document.querySelectorAll('.assembly-checkbox').forEach(cb => {
        cb.addEventListener('click', () => {
            cb.classList.toggle('checked');
        });
    });

    document.getElementById('backToProducts').addEventListener('click', () => {
        renderProducts(state.products);
    });

    document.getElementById('clearAssembly').addEventListener('click', () => {
        if (confirm('Очистить корзину?')) {
            state.cart = {};
            renderAssembly();
        }
    });

    document.getElementById('printAssembly').addEventListener('click', () => {
        printAssemblyList(items);
    });
}

function printAssemblyList(items) {
    const printWindow = window.open('', '_blank');
    const date = new Date().toLocaleDateString('ru-RU');
    const category = state.currentCategory ? state.currentCategory.name : 'Все категории';

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Заявка на занос - ${date}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { font-size: 18px; margin-bottom: 10px; }
                .meta { color: #666; margin-bottom: 20px; font-size: 14px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                th { background: #f5f5f5; font-weight: bold; }
                tr:nth-child(even) { background: #fafafa; }
                .qty { text-align: center; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>Заявка на занос</h1>
            <div class="meta">Дата: ${date}<br>Категория: ${category}</div>
            <table>
                <tr>
                    <th>№</th>
                    <th>Товар</th>
                    <th>Артикул</th>
                    <th>Кол-во</th>
                </tr>
                ${items.map((item, i) => `
                    <tr>
                        <td>${i + 1}</td>
                        <td>${item.name}</td>
                        <td>${item.vendor_code || '-'}</td>
                        <td class="qty">${item.quantity}</td>
                    </tr>
                `).join('')}
            </table>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

function renderPriceCheckPages(pages) {
    const content = document.getElementById('priceCheckContent');
    content.innerHTML = `
        <div class="pages-grid">
            ${pages.map((page, index) => {
                const isLocked = state.priceCheck.locks.some(l => l.page === page.pageNumber);
                const isMyLock = state.priceCheck.locks.some(l => l.page === page.pageNumber && l.user === state.currentUser?.login);

                return `
                    <div class="page-item ${isLocked && !isMyLock ? 'locked' : ''} ${isMyLock ? 'active' : ''}" 
                         data-page="${page.pageNumber}"
                         style="animation: fadeIn ${index * 0.03}s ease-out">
                        <div class="page-number">Стр. ${page.pageNumber}</div>
                        <div class="page-status">
                            ${isLocked ? (isMyLock ? '✓ Ваше' : '🔒 Занято') : 'Свободно'}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    document.querySelectorAll('.page-item:not(.locked)').forEach(item => {
        item.addEventListener('click', async () => {
            const page = parseInt(item.dataset.page);
            try {
                await api.lockPriceCheckPage(page);
                await loadPriceCheckPage(page);
            } catch (error) {
                utils.showToast('Не удалось заблокировать страницу', 'error');
            }
        });
    });
}

async function loadPriceCheckPage(page) {
    const content = document.getElementById('priceCheckContent');
    content.innerHTML = '<div class="loading">Загрузка товаров...</div>';

    try {
        const data = await api.getPriceCheckProducts(page);
        state.priceCheck.currentPage = page;
        state.priceCheck.products = data.products;
        renderPriceCheckProducts(data.products);
    } catch (error) {
        content.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Ошибка загрузки</p></div>';
    }
}

function renderPriceCheckProducts(products) {
    const content = document.getElementById('priceCheckContent');
    content.innerHTML = `
        <div style="padding: 16px;">
            ${products.map((product, index) => `
                <div class="pc-product" data-id="${product.id}" style="animation: fadeInUp ${index * 0.03}s ease-out">
                    <img src="${product.image || '/data/image-cache-v5/no-image.webp'}" 
                         class="pc-product-image" 
                         alt="${utils.escapeHtml(product.name)}">
                    <div class="pc-product-info">
                        <div class="pc-product-name">${utils.escapeHtml(product.name)}</div>
                        <div class="pc-product-code">${product.vendor_code || 'Нет артикула'}</div>
                        <div class="pc-product-actions">
                            <button class="pc-btn problem ${product.hasProblem ? 'active' : ''}" data-type="problem">
                                ⚠️ Проблема
                            </button>
                            <button class="pc-btn price ${product.hasPriceIssue ? 'active' : ''}" data-type="price">
                                🏷️ Ценник
                            </button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="bottom-actions">
            <button class="btn btn-secondary" id="backToPages">← К страницам</button>
            <button class="btn btn-primary" id="completePage">✓ Готово</button>
        </div>
    `;

    document.querySelectorAll('.pc-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const productId = btn.closest('.pc-product').dataset.id;
            const type = btn.dataset.type;

            try {
                await api.markPriceCheckProduct(productId, type);
                btn.classList.toggle('active');

                // Animation feedback
                btn.style.transform = 'scale(0.95)';
                setTimeout(() => btn.style.transform = '', 150);
            } catch (error) {
                utils.showToast('Ошибка сохранения', 'error');
            }
        });
    });

    document.getElementById('backToPages').addEventListener('click', async () => {
        if (state.priceCheck.currentPage) {
            await api.unlockPriceCheckPage(state.priceCheck.currentPage);
        }
        screens['price-check']();
    });

    document.getElementById('completePage').addEventListener('click', async () => {
        if (state.priceCheck.currentPage) {
            await api.unlockPriceCheckPage(state.priceCheck.currentPage);
            utils.showToast('Страница проверена!', 'success');
            screens['price-check']();
        }
    });
}

function renderProductCheck(products) {
    const content = document.getElementById('productCheckContent');
    const visibleProducts = products.filter(p => !state.productCheck.hidden.has(p.id));

    if (visibleProducts.length === 0) {
        content.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div><p>Все товары проверены!</p></div>';
        return;
    }

    content.innerHTML = `
        <div style="padding: 16px;">
            ${visibleProducts.map((product, index) => `
                <div class="pc-product" data-id="${product.id}" style="animation: fadeInUp ${index * 0.03}s ease-out">
                    <img src="${product.image || '/data/image-cache-v5/no-image.webp'}" 
                         class="pc-product-image" 
                         alt="${utils.escapeHtml(product.name)}">
                    <div class="pc-product-info">
                        <div class="pc-product-name">${utils.escapeHtml(product.name)}</div>
                        <div class="pc-product-code">${product.vendor_code || 'Нет артикула'}</div>
                        <div class="pc-product-actions">
                            <button class="pc-btn price" data-action="hide">✓ Проверено</button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    document.querySelectorAll('[data-action="hide"]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const productId = btn.closest('.pc-product').dataset.id;
            try {
                await api.hideProductCheckProduct(productId);
                state.productCheck.hidden.add(productId);
                btn.closest('.pc-product').style.animation = 'fadeOut 0.3s ease-out';
                setTimeout(() => renderProductCheck(products), 300);
            } catch (error) {
                utils.showToast('Ошибка сохранения', 'error');
            }
        });
    });
}

function renderCalendar(events) {
    const content = document.getElementById('calendarContent');
    const startOfWeek = new Date(state.calendar.currentWeek);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);

    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const today = new Date();

    content.innerHTML = `
        <div class="calendar-grid">
            ${Array.from({length: 7}, (_, i) => {
                const d = new Date(startOfWeek);
                d.setDate(d.getDate() + i);
                const isToday = d.toDateString() === today.toDateString();
                const dayEvents = events.filter(e => new Date(e.date).toDateString() === d.toDateString());

                return `
                    <div class="calendar-day ${isToday ? 'active' : ''}" data-date="${d.toISOString()}">
                        <span class="calendar-day-name">${days[i]}</span>
                        <span class="calendar-day-number">${d.getDate()}</span>
                        ${dayEvents.length > 0 ? `<div style="width: 6px; height: 6px; background: var(--accent-cyan); border-radius: 50%; margin-top: 4px;"></div>` : ''}
                    </div>
                `;
            }).join('')}
        </div>
        <div class="calendar-events">
            ${events.length === 0 ? '<div class="empty-state" style="padding: 40px 20px;"><div class="empty-icon">📭</div><p>Нет событий на этой неделе</p></div>' : ''}
            ${events.map((event, index) => `
                <div class="event-item" data-id="${event.id}" style="animation: fadeInUp ${index * 0.05}s ease-out">
                    <div class="event-title">${utils.escapeHtml(event.title)}</div>
                    <div class="event-text">${utils.escapeHtml(event.description || '')}</div>
                    <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 8px;">
                        ${utils.formatDateTime(event.date)}
                    </div>
                    ${state.currentUser?.role === 'admin' ? `
                        <button class="icon-btn" data-action="delete" style="position: absolute; top: 16px; right: 16px; width: 28px; height: 28px;">🗑️</button>
                    ` : ''}
                </div>
            `).join('')}
        </div>
        ${state.currentUser?.role === 'admin' ? `
            <div class="bottom-actions">
                <button class="btn btn-primary" id="addEvent">+ Добавить событие</button>
            </div>
        ` : ''}
    `;

    if (state.currentUser?.role === 'admin') {
        document.getElementById('addEvent')?.addEventListener('click', () => {
            showEventModal();
        });

        document.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const eventId = btn.closest('.event-item').dataset.id;
                if (confirm('Удалить событие?')) {
                    try {
                        await api.deleteCalendarEvent(eventId);
                        utils.showToast('Событие удалено', 'success');
                        screens.calendar();
                    } catch (error) {
                        utils.showToast('Ошибка удаления', 'error');
                    }
                }
            });
        });
    }
}

function showEventModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-title">Новое событие</div>
            <input type="text" class="modal-input" id="eventTitle" placeholder="Название события" required>
            <textarea class="modal-input" id="eventDesc" placeholder="Описание" rows="3"></textarea>
            <input type="datetime-local" class="modal-input" id="eventDate" required>
            <div class="modal-actions">
                <button class="btn btn-secondary" id="cancelEvent">Отмена</button>
                <button class="btn btn-primary" id="saveEvent">Сохранить</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('cancelEvent').addEventListener('click', () => modal.remove());

    document.getElementById('saveEvent').addEventListener('click', async () => {
        const title = document.getElementById('eventTitle').value;
        const description = document.getElementById('eventDesc').value;
        const date = document.getElementById('eventDate').value;

        if (!title || !date) {
            utils.showToast('Заполните обязательные поля', 'error');
            return;
        }

        try {
            await api.createCalendarEvent({ title, description, date });
            utils.showToast('Событие создано', 'success');
            modal.remove();
            screens.calendar();
        } catch (error) {
            utils.showToast('Ошибка создания', 'error');
        }
    });
}

async function loadAdminTab(tab) {
    const content = document.getElementById('adminContent');
    content.innerHTML = '<div class="loading">Загрузка...</div>';

    try {
        switch(tab) {
            case 'overview':
                const stats = await api.getAdminStats();
                renderAdminOverview(stats);
                break;
            case 'users':
                const users = await api.getAdminUsers();
                state.admin.users = users;
                renderAdminUsers(users);
                break;
            case 'locks':
                const locks = await api.getLocks();
                renderAdminLocks(locks);
                break;
            case 'sync':
                const syncStatus = await api.getSyncStatus();
                renderAdminSync(syncStatus);
                break;
        }
    } catch (error) {
        content.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Ошибка загрузки данных</p></div>';
    }
}

function renderAdminOverview(stats) {
    const content = document.getElementById('adminContent');
    content.innerHTML = `
        <div class="admin-sections">
            <div class="admin-card">
                <div class="admin-card-title">Статистика системы</div>
                <div class="stat-row">
                    <span class="stat-label">Всего товаров</span>
                    <span class="stat-value">${stats.totalProducts || 0}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Категорий</span>
                    <span class="stat-value">${stats.totalCategories || 0}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Пользователей</span>
                    <span class="stat-value">${stats.totalUsers || 0}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Активных сессий</span>
                    <span class="stat-value">${stats.activeSessions || 0}</span>
                </div>
            </div>

            <div class="admin-card">
                <div class="admin-card-title">Последняя синхронизация</div>
                <div class="stat-row">
                    <span class="stat-label">Дата</span>
                    <span class="stat-value">${stats.lastSync ? utils.formatDateTime(stats.lastSync) : 'Никогда'}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Статус</span>
                    <span class="stat-value" style="color: ${stats.syncStatus === 'success' ? 'var(--accent-green)' : 'var(--accent-orange)'}">
                        ${stats.syncStatus || 'Неизвестно'}
                    </span>
                </div>
            </div>
        </div>
    `;
}

function renderAdminUsers(users) {
    const content = document.getElementById('adminContent');
    content.innerHTML = `
        <div class="admin-sections">
            <div class="admin-card">
                <div class="admin-card-title">Пользователи</div>
                <button class="btn btn-primary" id="addUser" style="margin-bottom: 16px; width: 100%;">+ Добавить пользователя</button>
                <div class="users-list">
                    ${users.map(user => `
                        <div class="user-item" data-id="${user.id}">
                            <div class="user-info">
                                <div class="user-login">${utils.escapeHtml(user.login)}</div>
                                <div class="user-meta">
                                    <span class="user-role ${user.role}">${user.role === 'admin' ? 'Админ' : 'Сотрудник'}</span>
                                    <span class="user-status ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Активен' : 'Неактивен'}</span>
                                </div>
                                <div class="user-dates">
                                    Создан: ${utils.formatDate(user.createdAt)}
                                </div>
                            </div>
                            <div class="user-actions">
                                <button class="icon-btn" data-action="edit">✏️</button>
                                <button class="icon-btn" data-action="delete">🗑️</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    document.getElementById('addUser')?.addEventListener('click', () => showUserModal());

    document.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = btn.closest('.user-item').dataset.id;
            const user = users.find(u => u.id == userId);
            showUserModal(user);
        });
    });

    document.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.closest('.user-item').dataset.id;
            if (confirm('Удалить пользователя?')) {
                try {
                    await api.deleteUser(userId);
                    utils.showToast('Пользователь удален', 'success');
                    loadAdminTab('users');
                } catch (error) {
                    utils.showToast('Ошибка удаления', 'error');
                }
            }
        });
    });
}

function showUserModal(user = null) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-title">${user ? 'Редактировать' : 'Новый пользователь'}</div>
            <input type="text" class="modal-input" id="userLogin" placeholder="Логин" value="${user?.login || ''}" ${user ? 'readonly' : ''} required>
            <input type="password" class="modal-input" id="userPassword" placeholder="${user ? 'Новый пароль (оставьте пустым чтобы не менять)' : 'Пароль'}" ${user ? '' : 'required'}>
            <select class="modal-input" id="userRole">
                <option value="staff" ${user?.role === 'staff' ? 'selected' : ''}>Сотрудник</option>
                <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Администратор</option>
            </select>
            <label class="checkbox-label">
                <input type="checkbox" id="userActive" ${user?.isActive !== false ? 'checked' : ''}>
                Активен
            </label>
            <div class="modal-actions">
                <button class="btn btn-secondary" id="cancelUser">Отмена</button>
                <button class="btn btn-primary" id="saveUser">Сохранить</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('cancelUser').addEventListener('click', () => modal.remove());

    document.getElementById('saveUser').addEventListener('click', async () => {
        const login = document.getElementById('userLogin').value;
        const password = document.getElementById('userPassword').value;
        const role = document.getElementById('userRole').value;
        const isActive = document.getElementById('userActive').checked;

        if (!login || (!user && !password)) {
            utils.showToast('Заполните обязательные поля', 'error');
            return;
        }

        try {
            if (user) {
                await api.updateUser(user.id, { role, isActive, ...(password && { password }) });
            } else {
                await api.createUser({ login, password, role, isActive });
            }
            utils.showToast('Пользователь сохранен', 'success');
            modal.remove();
            loadAdminTab('users');
        } catch (error) {
            utils.showToast('Ошибка сохранения', 'error');
        }
    });
}

function renderAdminLocks(locks) {
    const content = document.getElementById('adminContent');
    content.innerHTML = `
        <div class="admin-sections">
            <div class="admin-card">
                <div class="admin-card-title">Активные блокировки</div>
                ${locks.length === 0 ? '<div class="empty-state" style="padding: 40px;"><div class="empty-icon">🔓</div><p>Нет активных блокировок</p></div>' : ''}
                <div class="locks-list">
                    ${locks.map(lock => `
                        <div class="lock-item" data-category="${lock.category}" data-page="${lock.page}">
                            <div class="lock-info">
                                <div class="lock-category">${utils.escapeHtml(lock.category)}</div>
                                <div class="lock-meta">Страница: ${lock.page} | Пользователь: ${utils.escapeHtml(lock.user)}</div>
                                <div class="lock-time">${utils.formatDateTime(lock.lockedAt)}</div>
                            </div>
                            <button class="icon-btn" data-action="unlock">🔓</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    document.querySelectorAll('[data-action="unlock"]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const item = btn.closest('.lock-item');
            const category = item.dataset.category;
            const page = item.dataset.page;

            try {
                await api.forceUnlock(category, page);
                utils.showToast('Блокировка снята', 'success');
                item.style.animation = 'fadeOut 0.3s ease-out';
                setTimeout(() => item.remove(), 300);
            } catch (error) {
                utils.showToast('Ошибка разблокировки', 'error');
            }
        });
    });
}

function renderAdminSync(syncStatus) {
    const content = document.getElementById('adminContent');
    content.innerHTML = `
        <div class="admin-sections">
            <div class="admin-card">
                <div class="admin-card-title">Синхронизация каталога</div>
                <div class="sync-status">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                        <span style="color: var(--text-secondary);">Статус:</span>
                        <span style="color: ${syncStatus?.status === 'running' ? 'var(--accent-cyan)' : syncStatus?.status === 'completed' ? 'var(--accent-green)' : 'var(--text-secondary)'}; font-weight: 600;">
                            ${syncStatus?.status === 'running' ? '⏳ Выполняется...' : syncStatus?.status === 'completed' ? '✓ Завершено' : '⏸️ Ожидание'}
                        </span>
                    </div>
                    ${syncStatus?.progress ? `
                        <div class="sync-progress">
                            <div class="sync-progress-bar" style="width: ${syncStatus.progress}%"></div>
                        </div>
                        <div style="text-align: center; margin-top: 8px; font-size: 14px; color: var(--text-secondary);">
                            ${syncStatus.progress}%
                        </div>
                    ` : ''}
                    ${syncStatus?.lastSync ? `
                        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--glass-border);">
                            <div style="font-size: 14px; color: var(--text-tertiary);">
                                Последняя синхронизация: ${utils.formatDateTime(syncStatus.lastSync)}
                            </div>
                        </div>
                    ` : ''}
                </div>
                <button class="btn btn-primary" id="startSync" style="width: 100%; margin-top: 16px;" ${syncStatus?.status === 'running' ? 'disabled' : ''}>
                    ${syncStatus?.status === 'running' ? '⏳ Синхронизация...' : '🔄 Запустить синхронизацию'}
                </button>
            </div>
        </div>
    `;

    if (syncStatus?.status !== 'running') {
        document.getElementById('startSync')?.addEventListener('click', async () => {
            try {
                await api.syncCatalog();
                utils.showToast('Синхронизация запущена', 'success');
                loadAdminTab('sync');
            } catch (error) {
                utils.showToast('Ошибка запуска', 'error');
            }
        });
    }
}

// ============================================
// PWA Install Prompt
// ============================================
function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        state.deferredInstallPrompt = e;

        // Show install button after 5 seconds
        setTimeout(() => {
            if (!state.installPrompt) {
                const btn = document.createElement('button');
                btn.className = 'install-btn';
                btn.textContent = '⬇ Установить приложение';
                btn.addEventListener('click', async () => {
                    if (state.deferredInstallPrompt) {
                        state.deferredInstallPrompt.prompt();
                        const { outcome } = await state.deferredInstallPrompt.userChoice;
                        if (outcome === 'accepted') {
                            utils.showToast('Приложение установлено!', 'success');
                            btn.remove();
                        }
                    }
                });
                document.body.appendChild(btn);
                state.installPrompt = btn;
            }
        }, 5000);
    });
}

// ============================================
// Service Worker Registration
// ============================================
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered:', registration);
            })
            .catch(error => {
                console.log('SW registration failed:', error);
            });
    }
}

// ============================================
// Initialization
// ============================================
function init() {
    // Check auth status
    api.request('/api/auth/check')
        .then(result => {
            if (result.authenticated) {
                state.currentUser = result.user;
                screens.menu();
            } else {
                screens.login();
            }
        })
        .catch(() => screens.login());

    setupInstallPrompt();
    registerServiceWorker();
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
