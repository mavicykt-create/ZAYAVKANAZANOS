# ZAN 1.1 - Warehouse Management System

Современная система управления складом с iOS-дизайном для сотрудников.

## ✨ Особенности

- **Современный iOS-дизайн** - интерфейс в стиле Apple с плавными анимациями
- **PWA (Progressive Web App)** - работает как нативное приложение
- **Офлайн-режим** - кэширование статики и изображений
- **Адаптивный дизайн** - оптимизирован для мобильных устройств
- **Тёмная тема** - автоматическое переключение
- **Touch-friendly** - крупные элементы для работы в перчатках

## 🚀 Быстрый старт

### Установка

```bash
# Клонировать репозиторий
git clone <repo-url>
cd zan11-design

# Установить зависимости
npm install

# Запустить сервер
npm start
```

Откройте http://localhost:3000

### Данные для входа

- **Администратор**: `admin` / `7895123`
- **Сотрудник**: `user` / `7895123`

## 📱 Установка как PWA

### iOS (Safari)
1. Откройте приложение в Safari
2. Нажмите "Поделиться" (Share)
3. Выберите "На экран Домой" (Add to Home Screen)

### Android (Chrome)
1. Откройте приложение в Chrome
2. Нажмите меню (три точки)
3. Выберите "Установить приложение"

## 🛠 Функциональность

### 1. Заявка на занос
- Выбор товаров по категориям
- Сетка товаров с изображениями
- Быстрое добавление/удаление (тап по карточке)
- Сборка и печать заявок

### 2. Проверка ценников
- Разбивка по страницам (50 товаров)
- Блокировка страниц между пользователями
- Отметка проблем и проверенных ценников

### 3. Проверка товара
- Список товаров без штрих-кода
- Возможность скрыть из списка

### 4. Календарь недели
- Просмотр событий на неделю
- Управление событиями (админ)

### 5. Админка
- Обзор системы (онлайн пользователи, статистика)
- Управление пользователями
- Синхронизация каталога

## 🎨 Дизайн-система

### Цвета (iOS System Colors)
- Primary: `#007AFF` (iOS Blue)
- Success: `#34C759` (iOS Green)
- Warning: `#FF9500` (iOS Orange)
- Danger: `#FF3B30` (iOS Red)
- Background: `#F2F2F7` (iOS Gray 6)

### Типографика
- Шрифт: SF Pro / системный sans-serif
- Заголовки: 17px, weight 600
- Основной текст: 17px, weight 400
- Вторичный текст: 15px, цвет Gray

## 📁 Структура проекта

```
.
├── server.js              # Главный файл сервера
├── package.json           # Зависимости
├── README.md              # Документация
├── routes/                # API роуты
│   ├── auth.js
│   ├── catalog.js
│   ├── carry.js
│   ├── priceCheck.js
│   ├── productCheck.js
│   ├── calendar.js
│   ├── admin.js
│   ├── stats.js
│   └── sync.js
├── services/              # Бизнес-логика
│   ├── database.js        # Инициализация БД
│   └── sync.js            # Синхронизация с YML
├── middleware/            # Middleware
│   └── auth.js
└── public/                # Фронтенд
    ├── index.html
    ├── manifest.json
    ├── sw.js              # Service Worker
    ├── css/
    │   └── style.css      # iOS-стили
    ├── js/
    │   └── app.js         # Frontend логика
    └── icons/             # PWA иконки
```

## 🔧 Технологии

- **Backend**: Node.js 20+, Express, SQLite (better-sqlite3)
- **Frontend**: Vanilla JS, CSS3, PWA
- **Дизайн**: iOS Human Interface Guidelines

## 📝 API Endpoints

### Auth
- `POST /api/auth/login` - Вход
- `POST /api/auth/logout` - Выход
- `GET /api/auth/me` - Проверка сессии

### Catalog
- `GET /api/catalog/categories` - Список категорий
- `GET /api/catalog/products/:categoryId` - Товары категории
- `GET /api/catalog/search?q=query` - Поиск товаров

### Carry
- `GET /api/carry/requests` - Текущие заявки
- `POST /api/carry/request` - Добавить/обновить заявку
- `POST /api/carry/complete-category` - Завершить категорию
- `GET /api/carry/assembly` - Список для сборки
- `POST /api/carry/complete-order` - Завершить сборку

### Price Check
- `GET /api/price-check/pages/:categoryId` - Страницы категории
- `POST /api/price-check/lock-page` - Заблокировать страницу
- `POST /api/price-check/unlock-page` - Разблокировать страницу
- `GET /api/price-check/products/:categoryId/:pageNumber` - Товары страницы

### Admin
- `GET /api/admin/overview` - Обзор системы
- `GET /api/admin/users` - Список пользователей
- `POST /api/admin/users` - Создать пользователя
- `PUT /api/admin/users/:id` - Обновить пользователя
- `DELETE /api/admin/users/:id` - Удалить пользователя

## 🚀 Деплой

### Amvera
1. Зарегистрируйтесь на [amvera.ru](https://amvera.ru)
2. Создайте приложение
3. Подключите GitHub репозиторий
4. Приложение автоматически задеплоится

### Другие платформы
```bash
# Установить зависимости
npm install --production

# Запустить
npm start
```

## 📄 Лицензия

MIT License

---

**ZAN 1.1** - Сделано с ❤️ для эффективной работы склада
