# ZAN 1.1 - Руководство по развёртыванию

## 📦 Содержимое архива

```
ZAN_1.1_Full_Deploy/
├── server.js                 # Главный сервер Express
├── package.json              # Зависимости Node.js
├── amvera.yml               # Конфиг для Amvera
├── README.md                # Документация
├── routes/                  # API endpoints
│   ├── auth.js             # Авторизация
│   ├── catalog.js          # Каталог товаров
│   ├── carry.js            # Заявка на занос
│   ├── priceCheck.js       # Проверка ценников
│   ├── productCheck.js     # Проверка товара
│   ├── calendar.js         # Календарь
│   ├── admin.js            # Админка
│   ├── stats.js            # Статистика
│   └── sync.js             # Синхронизация
├── services/               # Бизнес-логика
│   ├── database.js         # SQLite + инициализация
│   └── sync.js             # Синхронизация с YML
├── middleware/             # Middleware
│   └── auth.js             # Проверка авторизации
├── data/                   # Данные
│   └── image-cache-v5/     # Кэш изображений
└── public/                 # Фронтенд
    ├── index.html          # Главная страница
    ├── css/
    │   └── style.css       # Стили (Glassmorphism)
    └── js/
        └── app.js          # Логика приложения
```

## 🚀 Быстрый старт (Local)

```bash
# 1. Распакуй архив
cd ZAN_1.1_Full_Deploy

# 2. Установи зависимости
npm install

# 3. Запусти сервер
npm start

# 4. Открой в браузере
http://localhost:80
```

## 🔑 Данные для входа

- **Админ:** login: `admin`, password: `7895123`
- **Сотрудник:** login: `user`, password: `7895123`

## 🌐 Деплой на Amvera

### Вариант 1: Через GitHub
1. Загрузи код на GitHub
2. В Amvera создай новое приложение
3. Подключи GitHub репозиторий
4. Укажи ветку `main`
5. Нажми "Развернуть"

### Вариант 2: ZIP архив
1. В Amvera выбери "Загрузить архив"
2. Загрузи `ZAN_1.1_Full_Deploy.zip`
3. Укажи команду запуска: `npm start`
4. Укажи порт: `80`

## 🎨 Что нового в дизайне

### Исправлено:
- ✅ Мерцание карточек при нажатии (mobile)
- ✅ Фото товаров полностью в карточках
- ✅ Плавные 60fps анимации
- ✅ Glassmorphism UI с неоновыми акцентами

### Технологии:
- Node.js 20+
- Express + SQLite (better-sqlite3)
- Glassmorphism CSS
- Inter font
- PWA ready

## 🔧 Переменные окружения (опционально)

```bash
PORT=80                    # Порт сервера
DB_PATH=./data/zan11.db   # Путь к базе данных
SESSION_SECRET=your_key   # Секрет сессий
```

## 📱 PWA

Приложение можно установить на телефон:
1. Открой сайт в Chrome/Safari
2. Нажми "Поделиться" → "На экран Домой"
3. Приложение будет работать офлайн

## 🔄 Синхронизация каталога

1. Войди как admin
2. Перейди в Админку → Синхронизация
3. Нажми "Запустить синхронизацию"
4. Жди завершения (загрузка YML + обработка фото)

## 🐛 Тестирование

Проверено на:
- ✅ iOS Safari (iPhone 12+)
- ✅ Android Chrome
- ✅ Desktop Chrome/Firefox/Safari
- ✅ 60fps на мобильных устройствах

## 📞 Поддержка

При проблемах:
1. Проверь логи: `npm start` в консоли
2. Очисти кэш браузера (Ctrl+Shift+R)
3. Проверь права на папку `data/`
